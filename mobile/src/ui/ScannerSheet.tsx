import { useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, EmptyState, Hint } from './primitives';
import { Sheet } from './Sheet';

export function ScannerSheet(props: { visible: boolean; onClose: () => void; onScan: (value: string) => void }) {
  return <Sheet title="Scan computer QR code" visible={props.visible} onClose={props.onClose} scroll={false}>
    {props.visible && <Scanner onScan={props.onScan} />}
  </Sheet>;
}
function Scanner({ onScan }: { onScan: (value: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const scanned = useRef(false);
  const [invalid, setInvalid] = useState(false);
  if (!permission?.granted) return <EmptyState icon="camera-outline" title="Scan to connect"
    detail="Use your camera to scan the pairing QR code shown by Vibyra Host. Photos are not captured or saved.">
    <Button title={permission?.canAskAgain === false ? 'Open camera settings' : 'Allow camera'}
      onPress={() => { void (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission()); }} />
  </EmptyState>;
  return <View style={s.body}>
    <View style={s.camera}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={event => {
          if (scanned.current) return;
          if (event.data.startsWith('vibyra://pair')) { scanned.current = true; onScan(event.data); }
          else setInvalid(true);
        }} />
      <View pointerEvents="none" style={s.frame} />
    </View>
    <Hint>Position the Vibyra pairing code inside the frame.</Hint>
    {invalid && <Hint error>This is not a Vibyra pairing code. Scan the code shown by Vibyra Host.</Hint>}
  </View>;
}
const s = StyleSheet.create({
  body: { flex: 1, padding: 22, gap: 20 }, camera: { flex: 1, borderRadius: 26, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center' },
  frame: { width: '75%', aspectRatio: 1, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 24 },
});
