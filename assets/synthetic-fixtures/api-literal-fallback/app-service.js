const endpointMap = {
  balance: "/api/wallet/balance",
  coupon: "/webapi/coupon/detail"
};

const bootstrapConfig = {
  apiBase: "https://api.example.test",
  appId: "wx1234567890abcdef",
  appSecret: "fake_app_secret_for_example_test",
  defaultAccount: "demo@example.test",
  defaultPassword: "fake_password_for_example_test",
  tenantId: "tenant_demo"
};

function endpointFor(name) {
  return endpointMap[name];
}
