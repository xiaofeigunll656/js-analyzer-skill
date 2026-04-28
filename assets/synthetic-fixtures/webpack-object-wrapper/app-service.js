var p = "https://api.example.test";
var g = {};

function s(path, data) {
  return wx.request({
    url: p + path,
    method: "POST",
    data: data,
    header: {
      Authorization: wx.getStorageSync("token")
    }
  });
}

g["a"] = function(path, data) {
  return s(path, data);
};

Object(g["a"])("/auth/getUserInfo", {
  userId: "u001"
}).then(function(res) {
  return res.data.userName;
});

Object(g["a"])("/auth/getUserMenus", {
  roleId: "r001"
});

Object(g["a"])("/authStaff/getMenuNoAuthorize", {
  staffId: "s001"
});

Object(g["a"])("/authStaff/initWoegoRoleAndResource", {
  tenantId: "t001"
});

Object(g["a"])("/file/image", {
  fileId: "f001"
});

Object(g["a"])("/logout", {
  sid: "sid001"
});

Object(g["a"])("/pageHits/getPageHitsCount", {
  page: "home"
});

Object(g["a"])("/pageHits/savePageHits", {
  page: "home",
  count: 1
});

g["a"]("/user/profile", {
  userId: "u002"
});

this.$ajaxRequest("/report/list", {
  pageNo: 1
});
