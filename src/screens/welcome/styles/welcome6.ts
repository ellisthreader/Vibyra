import { colors } from "../../../styles/theme";

export const welcome6 = {
  setupTitleRow: {
    alignItems: "center" as const,
    alignSelf: "stretch" as const,
    flexDirection: "row" as const,
    justifyContent: "center" as const,
    minHeight: 48,
    paddingHorizontal: 8
  },
  setupTitle: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 38,
    fontWeight: "900" as const,
    letterSpacing: 0,
    lineHeight: 46,
    textAlign: "center" as const
  },
  typewriterCaret: {
    backgroundColor: "#A6ADBA",
    borderRadius: 1,
    height: 34,
    marginLeft: 4,
    width: 3
  },
  typewriterCaretHidden: {
    opacity: 0
  },
  morphWrap: {
    alignItems: "center" as const,
    height: 120,
    justifyContent: "center" as const,
    marginVertical: 22,
    width: 120
  },
  morphIconLayer: {
    alignItems: "center" as const,
    height: 96,
    justifyContent: "center" as const,
    position: "absolute" as const,
    width: 96
  },
  setupBody: {
    color: "rgba(166, 173, 186, 0.78)",
    fontSize: 15,
    fontWeight: "500" as const,
    letterSpacing: 0.1,
    lineHeight: 22,
    marginTop: 4,
    maxWidth: 320,
    paddingHorizontal: 12,
    textAlign: "center" as const
  },
  setupDownloadLink: {
    color: "#A6ADBA",
    fontSize: 13,
    fontWeight: "800" as const,
    lineHeight: 18,
    marginTop: 10,
    textAlign: "center" as const,
    textDecorationColor: "rgba(91, 124, 250, 0.42)" as const,
    textDecorationLine: "underline" as const
  },
  setupConfirmBlock: {
    alignItems: "center" as const,
    alignSelf: "stretch" as const,
    gap: 12,
    marginTop: 4
  },
  setupScanHelp: {
    alignSelf: "center" as const,
    backgroundColor: "rgba(24, 26, 32, 0.72)",
    borderColor: "rgba(91, 124, 250, 0.22)",
    borderRadius: 14,
    borderWidth: 1,
    color: "#A6ADBA",
    fontSize: 13,
    fontWeight: "800" as const,
    lineHeight: 18,
    marginTop: 12,
    maxWidth: 330,
    overflow: "hidden" as const,
    paddingHorizontal: 14,
    paddingVertical: 11,
    textAlign: "center" as const
  }
};
