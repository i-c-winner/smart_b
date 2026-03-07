export type LoginPayload = {
  email: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: "bearer";
};

export type RegisterPayload = {
  email: string;
  full_name: string;
  password: string;
};
