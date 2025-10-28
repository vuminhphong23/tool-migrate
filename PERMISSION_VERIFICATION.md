# 🔍 Permission Verification Guide

Hướng dẫn chi tiết để verify permissions đã được migrate thành công.

## 📋 Các phương pháp verification

### 1. 🎯 **UI-based Verification (Recommended)**

#### **A. Migration Results trong UI**
Sau khi chạy migration, UI sẽ hiển thị detailed results:

```
📊 Migration Results
✅ Migration completed successfully

👥 Roles: 5/5 successful
🔐 Policies: 8/8 successful  
🔑 Permissions: 45/50 successful
```

#### **B. Permission Verifier Tool**
1. Click button **🔍 Verify Permissions** trong main UI
2. Click **Load Permissions** để fetch tất cả permissions từ target instance
3. Sử dụng filters để tìm specific permissions:
   - **Search**: Tìm theo collection, action, hoặc policy name
   - **Collection Filter**: Filter theo specific collection
   - **Action Filter**: Filter theo action (create, read, update, delete, etc.)

**Features:**
- ✅ **Real-time filtering** và search
- ✅ **Export to CSV** để analyze offline
- ✅ **Detailed view** với policy links, fields, rules
- ✅ **Summary statistics** 

### 2. 🖥️ **Command Line Verification**

#### **A. Verify Target Permissions**
```bash
# Verify all permissions
node verify-permissions.js http://target:8055 your-token

# Verify specific collection
node verify-permissions.js http://target:8055 your-token news_listing

# Verify specific action
node verify-permissions.js http://target:8055 your-token news_listing read
```

#### **B. Compare Source vs Target**
```bash
node compare-permissions.js http://source:8055 source-token http://target:8055 target-token
```

**Output example:**
```
📊 Comparison Results:
✅ Permissions in both instances: 45
❌ Only in source: 5  
➕ Only in target: 2
⚠️  Different details: 1

📈 Migration Analysis:
Migration Success Rate: 90.0% (45/50)
```

### 3. 🌐 **Direct API Verification**

#### **A. List All Permissions**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     "http://target:8055/permissions?limit=-1"
```

#### **B. Check Specific Permission**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     "http://target:8055/permissions/PERMISSION_ID"
```

#### **C. Filter by Collection**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     "http://target:8055/permissions?filter[collection][_eq]=news_listing"
```

## 🔧 Troubleshooting Common Issues

### ❌ **Permission Migration Failed**

**Possible causes:**
1. **Policy doesn't exist** in target
2. **Collection doesn't exist** in target schema  
3. **Insufficient permissions** to create permissions
4. **ID conflicts** (rare with new ID generation)

**Solutions:**
1. ✅ Migrate policies BEFORE permissions
2. ✅ Ensure target schema matches source
3. ✅ Use admin token for migration
4. ✅ Check migration logs in browser console

### ⚠️ **Partial Migration Success**

**Check these:**
- **Policy linking**: Permissions need valid policy UUIDs
- **Collection validation**: Collections must exist in target
- **Field validation**: Permission fields must exist in target schema
- **User permissions**: Migration user needs permission CRUD access

### 🔍 **Verification Checklist**

#### **Before Migration:**
- [ ] Source permissions loaded correctly
- [ ] Target policies exist
- [ ] Target collections exist  
- [ ] Migration user has admin access

#### **After Migration:**
- [ ] Check migration results in UI
- [ ] Run Permission Verifier tool
- [ ] Compare source vs target counts
- [ ] Test actual permission functionality
- [ ] Verify policy-permission relationships

#### **Detailed Verification:**
- [ ] All selected permissions migrated
- [ ] Policy UUIDs correctly linked
- [ ] Field restrictions preserved
- [ ] Permission rules (permissions/validation/presets) intact
- [ ] No orphaned permissions created

## 📊 **Expected Results**

### **Successful Migration:**
```
✅ All selected permissions migrated
✅ Policy relationships maintained  
✅ Field restrictions preserved
✅ Permission rules intact
✅ No orphaned permissions
```

### **Migration Success Rate:**
- **95-100%**: Excellent ✅
- **85-94%**: Good (check failed items) ⚠️
- **<85%**: Issues need investigation ❌

## 🚀 **Best Practices**

### **Pre-Migration:**
1. **Backup** both source and target instances
2. **Test migration** on staging environment first
3. **Verify schema compatibility** between instances
4. **Use admin tokens** for migration

### **During Migration:**
1. **Monitor browser console** for errors
2. **Don't close browser** during migration
3. **Check validation results** before proceeding
4. **Review selected items** carefully

### **Post-Migration:**
1. **Run verification tools** immediately
2. **Test actual functionality** in target instance
3. **Document any issues** found
4. **Keep migration logs** for troubleshooting

## 🔗 **Related Documentation**

- [ACCESS_CONTROL_MIGRATION.md](./ACCESS_CONTROL_MIGRATION.md) - Main migration guide
- [Directus Permissions API](https://docs.directus.io/reference/system/permissions.html) - Official API docs
- Migration logs in browser Developer Tools → Console

## 💡 **Tips**

- **Use Permission Verifier** for quick visual confirmation
- **Export CSV** for detailed analysis and record keeping  
- **Compare scripts** help identify specific migration failures
- **Browser console** shows detailed error messages during migration
- **Test with actual users** to verify functional permissions
