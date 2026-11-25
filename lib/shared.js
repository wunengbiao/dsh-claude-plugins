let runtime

/** Publish the core runtime for the UI row that registers the settings API. */
export function setSharedRuntime(value) {
  runtime = value
}

/** Return the core runtime while its plugin is active. */
export function getSharedRuntime() {
  return runtime
}

/** Clear the shared runtime only when the disposing core still owns it. */
export function clearSharedRuntime(value) {
  if (runtime === value) runtime = undefined
}
