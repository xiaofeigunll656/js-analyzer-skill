const BASE_URL = "https://api.example.test";

function sendBox(option) {
  return wx.request({
    url: BASE_URL + option.url,
    method: option.method || "GET",
    data: option.data,
    header: {
      Authorization: wx.getStorageSync("token")
    },
    success(res) {
      return res.data;
    }
  });
}

function apiPost(path, payload) {
  return wx.request({
    url: BASE_URL + path,
    method: "POST",
    data: payload,
    success(res) {
      return res.data.records;
    }
  });
}

sendBox({
  url: "/api/member/profile",
  method: "GET",
  data: {
    memberId: "u001"
  }
});

apiPost("/api/order/list", {
  pageNo: 1,
  pageSize: 20
});
