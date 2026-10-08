//! Windows.Graphics.Capture of one window. Polled by the capture thread, so no
//! callbacks run on Windows' threads; frames are copied back to memory
//! through a staging texture.

use super::inventory::hwnd;
use super::{Bgra, Geometry};
use windows::core::{factory, Interface, HSTRING};
use windows::Foundation::Metadata::ApiInformation;
use windows::Graphics::Capture::{
    Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession,
};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Win32::Foundation::HMODULE;
use windows::Win32::Graphics::Direct3D::{
    D3D_DRIVER_TYPE, D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP,
};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D, D3D11_CPU_ACCESS_READ,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ, D3D11_SDK_VERSION,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::System::WinRT::Direct3D11::{
    CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess,
};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

pub(super) struct Wgc {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    pool: Direct3D11CaptureFramePool,
    session: GraphicsCaptureSession,
    staging: Option<(ID3D11Texture2D, u32, u32)>,
}

fn text(error: windows::core::Error) -> String {
    error.message()
}

impl Wgc {
    pub fn open(window: &Geometry) -> Result<Self, String> {
        // SAFETY: joins this capture thread to the multithreaded apartment.
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        if !GraphicsCaptureSession::IsSupported().map_err(text)? {
            return Err("Windows window capture is unavailable".into());
        }
        let (device, context) = device()?;
        let dxgi: IDXGIDevice = device.cast().map_err(text)?;
        // SAFETY: wraps a live D3D device for WinRT.
        let inspectable = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi) }.map_err(text)?;
        let winrt: IDirect3DDevice = inspectable.cast().map_err(text)?;
        let interop =
            factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>().map_err(text)?;
        // SAFETY: the handle was just verified to be this shared window.
        let item: GraphicsCaptureItem =
            unsafe { interop.CreateForWindow(hwnd(window.info.id)) }.map_err(text)?;
        let format = DirectXPixelFormat::B8G8R8A8UIntNormalized;
        let size = item.Size().map_err(text)?;
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(&winrt, format, 2, size)
            .map_err(text)?;
        let session = pool.CreateCaptureSession(&item).map_err(text)?;
        let _ = session.SetIsCursorCaptureEnabled(false);
        let class = HSTRING::from("Windows.Graphics.Capture.GraphicsCaptureSession");
        // Windows 11 lets the capture skip its yellow border.
        if ApiInformation::IsPropertyPresent(&class, &HSTRING::from("IsBorderRequired"))
            .unwrap_or(false)
        {
            let _ = session.SetIsBorderRequired(false);
        }
        session.StartCapture().map_err(text)?;
        Ok(Self {
            device,
            context,
            pool,
            session,
            staging: None,
        })
    }

    pub fn grab(&mut self) -> Result<Option<Bgra>, String> {
        let mut newest = None;
        while let Ok(frame) = self.pool.TryGetNextFrame() {
            newest = Some(frame);
        }
        let Some(frame) = newest else {
            return Ok(None);
        };
        let content = frame.ContentSize().map_err(text)?;
        let access: IDirect3DDxgiInterfaceAccess =
            frame.Surface().map_err(text)?.cast().map_err(text)?;
        // SAFETY: the surface is a D3D11 texture while `frame` is alive.
        let texture: ID3D11Texture2D = unsafe { access.GetInterface() }.map_err(text)?;
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        // SAFETY: fills one descriptor.
        unsafe { texture.GetDesc(&mut desc) };
        let staging = self.staging(&desc)?;
        let width = (content.Width.max(1) as u32).min(desc.Width);
        let height = (content.Height.max(1) as u32).min(desc.Height);
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        // SAFETY: copies between two textures of this device, then reads the
        // mapped rows within the texture's own pitch and height.
        unsafe {
            self.context.CopyResource(&staging, &texture);
            self.context
                .Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                .map_err(text)?;
            let pitch = mapped.RowPitch as usize;
            let mut data = Vec::with_capacity(width as usize * height as usize * 4);
            for row in 0..height as usize {
                let start = (mapped.pData as *const u8).add(row * pitch);
                data.extend_from_slice(std::slice::from_raw_parts(start, width as usize * 4));
            }
            self.context.Unmap(&staging, 0);
            Ok(Some(Bgra {
                width,
                height,
                stride: width as usize * 4,
                data,
            }))
        }
    }

    fn staging(&mut self, desc: &D3D11_TEXTURE2D_DESC) -> Result<ID3D11Texture2D, String> {
        if let Some((texture, width, height)) = &self.staging {
            if *width == desc.Width && *height == desc.Height {
                return Ok(texture.clone());
            }
        }
        let mut copy = *desc;
        copy.Usage = D3D11_USAGE_STAGING;
        copy.BindFlags = 0;
        copy.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
        copy.MiscFlags = 0;
        copy.MipLevels = 1;
        copy.ArraySize = 1;
        let mut texture = None;
        // SAFETY: creates a texture from a complete descriptor.
        unsafe { self.device.CreateTexture2D(&copy, None, Some(&mut texture)) }.map_err(text)?;
        let texture = texture.ok_or("Window capture could not allocate a frame")?;
        self.staging = Some((texture.clone(), desc.Width, desc.Height));
        Ok(texture)
    }
}

impl Drop for Wgc {
    fn drop(&mut self) {
        let _ = self.session.Close();
        let _ = self.pool.Close();
    }
}

/// The GPU when there is one; Windows' software renderer otherwise.
fn device() -> Result<(ID3D11Device, ID3D11DeviceContext), String> {
    let attempt = |kind: D3D_DRIVER_TYPE| {
        let (mut device, mut context) = (None, None);
        // SAFETY: out-parameters for a new device and its immediate context.
        unsafe {
            D3D11CreateDevice(
                None,
                kind,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                None,
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )
        }
        .ok()
        .and_then(|_| device.zip(context))
    };
    attempt(D3D_DRIVER_TYPE_HARDWARE)
        .or_else(|| attempt(D3D_DRIVER_TYPE_WARP))
        .ok_or_else(|| "No graphics device is available for window capture".into())
}
