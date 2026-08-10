/** Currency code/name/type shape. */
export type Currency = {
  code: string;
  name: string;
  type: "fiat" | "crypto";
};
