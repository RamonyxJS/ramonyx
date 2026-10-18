import { HttpError, route } from "ramonyx";

// Contoh error HTTP aman (status + pesan publik).
export const GET = route({
  handler: () => {
    throw new HttpError(403, "Tidak untukmu");
  },
});
