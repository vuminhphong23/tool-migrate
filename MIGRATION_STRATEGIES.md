# 🚀 Directus Migration Strategies - Troubleshooting Guide

## 🔍 Current Issue Analysis
Migration đang gặp lỗi - cần xác định root cause và tìm hướng giải quyết phù hợp.

## 📋 Possible Solutions & Strategies

### **Strategy 1: API Endpoint Testing** 
**Mục đích:** Xác định endpoint nào bị lỗi và tại sao

**Steps:**
1. Sử dụng Debug Tool trong ConnectionForm
2. Test từng endpoint riêng biệt:
   - `/server/info` - Kiểm tra kết nối cơ bản
   - `/users/me` - Kiểm tra authentication
   - `/roles` - Kiểm tra quyền truy cập roles
   - `/policies` - Kiểm tra quyền truy cập policies  
   - `/permissions` - Kiểm tra quyền truy cập permissions

**Expected Results:**
- Nếu `/server/info` fail → Network/URL issue
- Nếu `/users/me` fail → Authentication issue
- Nếu `/roles`, `/policies`, `/permissions` fail → Permission issue

---

### **Strategy 2: Manual Policy Creation Test**
**Mục đích:** Test khả năng tạo policy đơn giản

**Steps:**
1. Dùng Debug Tool → "Test Policy Creation"
2. Tạo 1 policy test đơn giản
3. Kiểm tra response và error

**Expected Results:**
- Success → API hoạt động, có thể là issue với data structure
- Fail → Permission hoặc API compatibility issue

---

### **Strategy 3: Alternative Migration Approach**
**Mục đích:** Bypass các issue hiện tại bằng cách thay đổi approach

#### **Option A: Step-by-step Migration**
```typescript
// Thay vì migrate tất cả cùng lúc, chia nhỏ:
1. Migrate roles only (skip policies/permissions)
2. Migrate policies only (skip permissions) 
3. Migrate permissions only
```

#### **Option B: Simplified Data Structure**
```typescript
// Loại bỏ các field có thể gây conflict:
const simplifiedPolicy = {
  id: policy.id,
  name: policy.name,
  icon: policy.icon || 'policy',
  description: policy.description || '',
  admin_access: false,
  app_access: true,
  enforce_tfa: false
  // Skip: permissions, roles, users arrays
}
```

#### **Option C: Direct Database Migration**
```sql
-- Nếu API không hoạt động, có thể migrate trực tiếp database
-- (Cần access vào database của cả source và target)
INSERT INTO directus_policies (id, name, icon, description, ...)
SELECT id, name, icon, description, ... FROM source_db.directus_policies;
```

---

### **Strategy 4: API Version Compatibility Check**
**Mục đích:** Đảm bảo source và target dùng cùng Directus version

**Steps:**
1. Check `/server/info` của cả source và target
2. So sánh Directus version
3. Nếu khác version → có thể cần adjust API calls

---

### **Strategy 5: Permission-based Troubleshooting**
**Mục đích:** Đảm bảo user có đủ quyền cho migration

**Required Permissions:**
```json
{
  "directus_roles": ["create", "read", "update"],
  "directus_policies": ["create", "read", "update"], 
  "directus_permissions": ["create", "read", "update"],
  "directus_access": ["create", "read", "update"]
}
```

**Test Steps:**
1. Kiểm tra user permissions trên target instance
2. Đảm bảo user có admin access hoặc đủ quyền cần thiết
3. Test với admin user nếu có thể

---

### **Strategy 6: Incremental Migration**
**Mục đích:** Migration từng phần để identify issue

```typescript
// Phase 1: Test với 1 policy đơn giản
const testMigration = {
  roles: [], // Skip roles
  policies: [simplestPolicy], // Chỉ 1 policy
  permissions: [] // Skip permissions
}

// Phase 2: Nếu thành công, thêm dần
// Phase 3: Full migration
```

---

## 🔧 Debug Commands

### **Browser Console Commands:**
```javascript
// Check current authentication
console.log('Auth type:', localStorage.getItem('sourceAuthType'))
console.log('Source URL:', localStorage.getItem('sourceUrl'))

// Manual API test
fetch('/policies?limit=1', {
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('sourceToken') }
}).then(r => r.json()).then(console.log)
```

### **Network Tab Analysis:**
1. Mở Developer Tools → Network tab
2. Chạy migration
3. Tìm request bị fail (đỏ)
4. Check request/response details

---

## 📞 Next Steps

1. **Immediate:** Sử dụng Debug Tool để identify exact error
2. **Short-term:** Apply appropriate strategy based on error type
3. **Long-term:** Implement robust error handling and retry logic

## 🆘 Common Error Patterns

| Error Pattern | Likely Cause | Solution Strategy |
|---------------|--------------|-------------------|
| 401 Unauthorized | Auth issue | Strategy 5 |
| 403 Forbidden | Permission issue | Strategy 5 |
| 404 Not Found | Wrong endpoint/version | Strategy 4 |
| 422 Validation Error | Data structure issue | Strategy 3B |
| 500 Server Error | Target server issue | Strategy 6 |

---

**Recommendation:** Bắt đầu với Strategy 1 (Debug Tool) để xác định exact error, sau đó apply strategy phù hợp.
