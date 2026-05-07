import { Ionicons } from "@expo/vector-icons";

export const connectGuideSteps: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  kicker: string;
  title: string;
  lines: string[];
}> = [
  {
    icon: "desktop-outline",
    kicker: "Step 1",
    title: "💻 Set up Vibyra on your computer",
    lines: [
      "Download Vibyra Desktop for Windows, Mac, or Linux.",
      "Install and open the app.",
      "Keep Vibyra running. You will see a connection code or QR code."
    ]
  },
  {
    icon: "phone-portrait-outline",
    kicker: "Step 2",
    title: "📱 Open Vibyra on your phone",
    lines: [
      "Download and open the Vibyra mobile app.",
      "Tap \"Connect to a Computer\"."
    ]
  },
  {
    icon: "link-outline",
    kicker: "Step 3",
    title: "🔗 Connect your devices",
    lines: [
      "✨ Find My Computer automatically finds your computer on the same Wi-Fi.",
      "🔢 Use Code lets you enter the code shown on your computer."
    ]
  },
  {
    icon: "shield-checkmark-outline",
    kicker: "Step 4",
    title: "🔐 Approve the connection",
    lines: [
      "A prompt will appear on your computer.",
      "Tap \"Allow\" to confirm.",
      "Your phone will connect instantly."
    ]
  },
  {
    icon: "sparkles-outline",
    kicker: "Step 5",
    title: "🎉 You're connected!",
    lines: [
      "Control your computer.",
      "Use touch as a mouse.",
      "Type with your phone keyboard."
    ]
  }
];

export const connectGuideTroubleshooting = [
  {
    title: "Can't find your computer?",
    lines: [
      "Make sure both devices are on the same Wi-Fi.",
      "Check that Vibyra is open on your computer."
    ]
  },
  {
    title: "Connecting from anywhere?",
    lines: ["Use \"Use Code\" instead of auto find."]
  }
];

export const connectGuideTips = [
  "Your computer will be saved for next time → just tap to reconnect.",
  "Keep Vibyra running on your computer for quick access."
];
