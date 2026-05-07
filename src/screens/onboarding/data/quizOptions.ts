import { ImageSourcePropType } from "react-native";
import { BuildIntent, DeviceMode, UsageFrequency } from "../types";
import { optionIcons } from "./options";

export const frequencyOptions: Array<{ label: string; value: UsageFrequency; icon: ImageSourcePropType }> = [
  { label: "Rarely", value: "rarely", icon: optionIcons.rarely },
  { label: "Occasionally", value: "occasionally", icon: optionIcons.occasionally },
  { label: "A few times", value: "few_times_week", icon: optionIcons.fewTimesWeek },
  { label: "Every day", value: "every_day", icon: optionIcons.everyDay }
];

export const intentOptions: Array<{ label: string; value: BuildIntent; icon: ImageSourcePropType }> = [
  { label: "Ideas", value: "exploring", icon: optionIcons.exploring },
  { label: "Learning", value: "learning", icon: optionIcons.learning },
  { label: "Side project", value: "side_project", icon: optionIcons.sideProject },
  { label: "App / website", value: "app_website", icon: optionIcons.appWebsite },
  { label: "Work", value: "work", icon: optionIcons.work },
  { label: "Automations", value: "automation", icon: optionIcons.automation }
];

export const deviceOptions: Array<{ label: string; value: DeviceMode; icon: ImageSourcePropType }> = [
  { label: "Phone", value: "phone_first", icon: optionIcons.phoneFirst },
  { label: "Phone + computer", value: "phone_computer", icon: optionIcons.phoneComputer },
  { label: "Computer", value: "computer_quick_edits", icon: optionIcons.computerEdits },
  { label: "Other", value: "other", icon: optionIcons.other }
];
