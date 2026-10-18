/** Error saat memindai/mengimpor manifest route & halaman. */
export class RouteManifestError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RouteManifestError";
  }
}
