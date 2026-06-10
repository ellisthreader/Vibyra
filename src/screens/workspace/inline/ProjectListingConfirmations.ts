import { Alert } from "react-native";

export function confirmMakeListingPrivate(onConfirm: () => void) {
  Alert.alert(
    "Make this listing private?",
    "It will disappear from Explore and its hosted runtime will stop. You can publish it again later.",
    [
      { style: "cancel", text: "Cancel" },
      { onPress: onConfirm, style: "destructive", text: "Make private" }
    ]
  );
}

export function confirmDeleteListing(onConfirm: () => void) {
  Alert.alert(
    "Delete this listing?",
    "This removes the Explore listing and stops its hosted runtime. Your local project files are not deleted.",
    [
      { style: "cancel", text: "Cancel" },
      { onPress: onConfirm, style: "destructive", text: "Delete listing" }
    ]
  );
}
