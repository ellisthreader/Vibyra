import {
  AI_TERMINAL_LAUNCH_CONTRACT_VERSION,
  terminalProviderAdapterForModel,
  terminalProviderIdForModel
} from "./aiTerminalProviderAdapters.mjs";

const BILLING_MODES = new Set(["vibyra", "provider"]);
const PERMISSION_MODES = new Set(["standard", "full"]);
const SANDBOX_MODES = new Set(["workspace-write", "danger-full-access"]);

export function resolveAiTerminalLaunchPlan(options = {}) {
  const requestedModel = normalizeModel(options.model);
  const model = resolveModel(requestedModel, options);
  const billingMode = normalizeBillingMode(options.billingMode ?? options.tokenMode);
  const permissionMode = normalizePermissionMode(options.permissionMode);
  const sandboxMode = normalizeSandboxMode(options.sandboxMode, permissionMode);
  const providerId = terminalProviderIdForModel(model);
  const adapter = terminalProviderAdapterForModel(model);

  if (!providerId || !adapter) {
    throw launchError("unsupported_provider", `No native terminal provider is registered for model "${model}".`);
  }
  assertAdapterReady(adapter, billingMode);
  assertPermissionContract(adapter, permissionMode, sandboxMode);

  const billingModel = normalizeModel(options.billingModel || billingProviderModel(model, providerId));
  const nativeModel = normalizeModel(options.nativeModel || nativeProviderModel(model, providerId));
  assertProviderModel("billingModel", billingModel, providerId);
  assertProviderModel("nativeModel", nativeModel, providerId);
  const allowedModels = resolveAllowedModels(options.allowedModels, billingModel, providerId);
  if (
    adapter.runtimeId === "vibyra-agent"
    && (
      billingModel !== model
      || nativeModel !== model
      || allowedModels.length !== 1
      || allowedModels[0] !== model
    )
  ) {
    throw launchError(
      "exact_model_required",
      "Vibyra Agent terminals must use the exact selected OpenRouter model for native execution and billing."
    );
  }

  return deepFreeze({
    billingMode,
    providerId,
    runtimeId: adapter.runtimeId,
    adapterId: adapter.adapterId,
    protocol: adapter.protocol,
    nativeModel,
    billingModel,
    allowedModels,
    permissionMode,
    sandboxMode,
    launchContractVersion: AI_TERMINAL_LAUNCH_CONTRACT_VERSION
  });
}

export const resolveTerminalLaunchPlan = resolveAiTerminalLaunchPlan;

function resolveModel(requestedModel, options) {
  if (!requestedModel) throw launchError("model_required", "A terminal model is required.");
  if (requestedModel !== "auto") return requestedModel;

  const initialTask = String(options.initialTask ?? options.task ?? "").trim();
  if (!initialTask) {
    throw launchError(
      "auto_task_required",
      "Auto requires an initial task so routing can finish before the native CLI launches."
    );
  }
  const routedModel = normalizeModel(options.routedModel);
  if (!routedModel || routedModel === "auto") {
    throw launchError(
      "auto_route_required",
      "Auto must resolve to a concrete provider model before the terminal launches."
    );
  }
  return routedModel;
}

function normalizeBillingMode(value) {
  const mode = String(value || "vibyra").trim().toLowerCase();
  const normalized = mode === "personal" ? "provider" : mode;
  if (!BILLING_MODES.has(normalized)) {
    throw launchError("invalid_billing_mode", `Unsupported terminal billing mode "${mode}".`);
  }
  return normalized;
}

function normalizePermissionMode(value) {
  const mode = String(value || "standard").trim().toLowerCase();
  if (!PERMISSION_MODES.has(mode)) {
    throw launchError("invalid_permission_mode", `Unsupported terminal permission mode "${mode}".`);
  }
  return mode;
}

function normalizeSandboxMode(value, permissionMode) {
  const fallback = permissionMode === "full" ? "danger-full-access" : "workspace-write";
  const mode = String(value || fallback).trim().toLowerCase();
  if (!SANDBOX_MODES.has(mode)) {
    throw launchError("invalid_sandbox_mode", `Unsupported terminal sandbox mode "${mode}".`);
  }
  if (permissionMode === "standard" && mode !== "workspace-write") {
    throw launchError("unsafe_sandbox_mode", "Standard permission mode requires workspace-write sandboxing.");
  }
  if (permissionMode === "full" && mode !== "danger-full-access") {
    throw launchError("permission_sandbox_mismatch", "Full permission mode requires danger-full-access sandboxing.");
  }
  return mode;
}

function assertAdapterReady(adapter, billingMode) {
  if (billingMode === "vibyra" && !adapter.managedCreditsReady) {
    throw launchError(
      "adapter_not_ready",
      `${adapter.runtimeId} is mapped for ${adapter.providerId}, but its Vibyra-credit ${adapter.protocol} adapter is not enabled.`
    );
  }
  if (billingMode === "provider" && !adapter.personalAccountReady) {
    throw launchError(
      "personal_account_not_supported",
      `${adapter.runtimeId} personal-account terminals are not currently supported.`
    );
  }
}

function assertPermissionContract(adapter, permissionMode, sandboxMode) {
  if (!adapter.permissionModes.includes(permissionMode) || !adapter.sandboxModes.includes(sandboxMode)) {
    throw launchError("unsupported_launch_mode", "The provider runtime does not support the requested launch mode.");
  }
}

function resolveAllowedModels(values, billingModel, providerId) {
  const input = values == null ? [billingModel] : values;
  if (!Array.isArray(input) || input.length === 0) {
    throw launchError("allowed_models_required", "At least one allowed model is required.");
  }
  const models = [...new Set(input.map(normalizeModel).filter(Boolean))];
  if (!models.includes(billingModel)) {
    throw launchError("billing_model_not_allowed", "The billing model must be included in allowedModels.");
  }
  for (const model of models) assertProviderModel("allowedModels", model, providerId);
  return models;
}

function assertProviderModel(field, model, providerId) {
  if (!model) throw launchError("model_required", `${field} must contain a model.`);
  const actualProvider = terminalProviderIdForModel(model);
  if (actualProvider !== providerId) {
    throw launchError(
      "provider_model_mismatch",
      `${field} model "${model}" does not belong to provider "${providerId}".`
    );
  }
}

function normalizeModel(value) {
  return String(value || "").trim().toLowerCase();
}

function nativeProviderModel(model, providerId) {
  const value = normalizeModel(model);
  if (terminalProviderAdapterForModel(value)?.runtimeId === "vibyra-agent") return value;
  if (providerId === "openai") return value;
  const prefix = `${providerId}/`;
  const native = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  if (providerId !== "anthropic") return native;
  return ({
    "claude-opus-4": "claude-opus-4-8",
    "claude-opus-4.8": "claude-opus-4-8",
    "claude-sonnet-4": "claude-sonnet-4-6",
    "claude-sonnet-4.6": "claude-sonnet-4-6",
    "claude-3-5-haiku": "claude-haiku-4-5",
    "claude-haiku-4.5": "claude-haiku-4-5"
  })[native] || native;
}

function billingProviderModel(model, providerId) {
  const value = normalizeModel(model);
  if (terminalProviderAdapterForModel(value)?.runtimeId === "vibyra-agent") return value;
  if (providerId === "openai" || value.startsWith(`${providerId}/`)) return value;
  if (providerId === "anthropic") {
    return ({
      "claude-opus-4": "anthropic/claude-opus-4.8",
      "claude-opus-4-8": "anthropic/claude-opus-4.8",
      "claude-sonnet-4": "anthropic/claude-sonnet-4.6",
      "claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
      "claude-3-5-haiku": "anthropic/claude-haiku-4.5",
      "claude-haiku-4-5": "anthropic/claude-haiku-4.5"
    })[value] || `anthropic/${value}`;
  }
  return `${providerId}/${value}`;
}

function launchError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = code === "adapter_not_ready" || code === "personal_account_not_supported" ? 409 : 422;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
