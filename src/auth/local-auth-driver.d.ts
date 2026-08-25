declare module "local-auth-driver" {
  export function getLocalTestDriver(): import("./local-driver-types").LocalTestDriver;
}
