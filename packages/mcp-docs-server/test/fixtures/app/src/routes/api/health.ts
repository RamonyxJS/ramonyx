export function GET() {
  return new Response("ok");
}

export function POST() {
  return new Response("created", { status: 201 });
}
