/** Deploy tratado como produção: exige políticas mais rígidas (auth dashboard, webhook generic, etc.). */
export function isProductionLike(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const v = process.env.API_ENV?.trim().toLowerCase();
  return v === "production";
}
