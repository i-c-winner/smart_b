type UserLike = {
  id: number;
  email: string;
  full_name: string;
  role?: string | null;
};

export function prepareUsersForDisplay<T extends UserLike>(users: T[]): T[] {
  return users.filter((user) => user.role !== "global_admin");
}
