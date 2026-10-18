export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface User {
  readonly id: string;
  readonly name: string;
}

export const users: readonly User[] = [
  { id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", name: "Rina" },
  { id: "9c858901-8a57-4791-81fe-4c455b099bc9", name: "Budi" },
];

export function findUser(id: string): User | undefined {
  return users.find((user) => user.id === id);
}
