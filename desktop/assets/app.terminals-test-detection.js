function applyTerminalTestRecommendation(recommendation) {
  const key = terminalTestPresetAliases[recommendation?.preset] || recommendation?.preset;
  const preset = terminalTestPresets.find((item) => item.key === key);
  if (!preset) {
    terminalTestDetectedLabel = "";
    return;
  }
  terminalTestPreset = preset.key;
  const baseLandscape = preset.width > preset.height;
  const recommendedLandscape = recommendation.orientation === "landscape";
  terminalTestLandscape = baseLandscape !== recommendedLandscape;
  terminalTestDetectedLabel = `Auto: ${recommendation.label || preset.label}`;
}

function clearTerminalTestRecommendation() {
  terminalTestDetectedLabel = "";
}
