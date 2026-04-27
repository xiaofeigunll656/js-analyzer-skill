const endpointMap = {
  balance: "/api/wallet/balance",
  coupon: "/webapi/coupon/detail"
};

function endpointFor(name) {
  return endpointMap[name];
}
