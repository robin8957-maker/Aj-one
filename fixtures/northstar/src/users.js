const users = [
  { id: "u_ada", name: "Ada", role: "admin" },
  { id: "u_grace", name: "Grace", role: "operator" },
];

export function listUsers() {
  return users.map((u) => ({ ...u }));
}

export function getUser(id) {
  return users.find((u) => u.id === id) ?? null;
}
