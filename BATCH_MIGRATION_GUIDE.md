# 🔄 Smart Batch Migration Guide

## Tổng quan

**Smart Batch Migration** là tính năng migration tự động cho nhiều collections cùng lúc, với khả năng phân tích dependency (quan hệ cha-con) và sắp xếp thứ tự migration tối ưu.

## Tính năng chính

### ✅ Phân tích Dependencies tự động
- Phát hiện quan hệ many-to-one giữa các collections
- Xác định collections nào phải migrate trước
- Cảnh báo về circular dependencies (quan hệ vòng tròn)

### ✅ Thứ tự Migration thông minh
- Tự động tính toán thứ tự migration tối ưu
- Collections "con" (có foreign key) được migrate sau collections "cha"
- Người dùng có thể điều chỉnh thứ tự thủ công

### ✅ Migration tuần tự với Progress Tracking
- Migrate từng collection một theo thứ tự
- Hiển thị progress bar và status real-time
- Báo cáo chi tiết kết quả từng collection

## Cách sử dụng

### Bước 1: Chọn Collections

1. Trong danh sách collections, check vào các collections bạn muốn migrate
2. Có thể chọn nhanh bằng filter "Existing" hoặc "New"

### Bước 2: Khởi động Smart Batch Migration

Click button **"🔄 Smart Batch Migration (X)"** ở toolbar phía trên

### Bước 3: Review Migration Order

Modal sẽ hiển thị:

#### **Warnings** (nếu có)
```
⚠️ Warnings:
• products has relations to system collections: directus_users, directus_files
• orders has relations to system collections: directus_users
```

#### **Circular Dependencies** (nếu có)
```
⚠️ Circular Dependencies Detected:
• collection_a → collection_b → collection_a
```
> ⚠️ Trong trường hợp này, bạn PHẢI sắp xếp lại thủ công hoặc chia nhỏ migration.

#### **Migration Order List**
```
1. categories
   No dependencies
   
2. products
   Depends on: categories
   
3. orders
   Depends on: products
```

### Bước 4: Điều chỉnh thứ tự (Optional)

Sử dụng nút **▲** và **▼** để di chuyển collections lên/xuống

> ⚠️ **Lưu ý:** System sẽ validate thứ tự mới và cảnh báo nếu vi phạm dependencies

### Bước 5: Start Migration

Click **"Start Migration (X collections)"**

### Bước 6: Theo dõi Progress

```
Migration Progress
───────────────────
products                           2 / 5
█████████████████░░░░░░░░░

Results:
✅ categories: 50 items imported (0 failed)
✅ products: 120 items imported (2 failed)
⏳ orders: In progress...
```

## Quy tắc Dependencies

### Many-to-One Relations

Collection **nguồn** phụ thuộc vào collection **đích**:

```typescript
// Collection: orders
order.product_id → products.id

// Dependencies:
// orders phụ thuộc products
// ⇒ Phải migrate products TRƯỚC orders
```

### System Collections

Relations đến system collections (như `directus_users`, `directus_files`) được giữ lại nhưng có cảnh báo về ID mapping:

```
⚠️ products has relations to system collections: directus_files
```

> **Giải pháp:** Ensure user/file IDs match between source and target, hoặc sử dụng ID mapping.

## Xử lý Circular Dependencies

### Ví dụ Circular Dependency

```
posts → authors → departments → posts
```

### Các giải pháp:

#### **Solution 1: Chia nhỏ Migration**

```bash
# Pass 1: Migrate without foreign keys
Migrate posts (skip author_id)
Migrate authors (skip department_id)
Migrate departments (skip manager_id)

# Pass 2: Update foreign keys manually
```

#### **Solution 2: Sắp xếp lại thủ công**

Phá vòng tròn bằng cách migrate một collection "giữa chừng":

```
1. authors (bỏ qua department_id tạm thời)
2. departments
3. posts
4. Update authors.department_id sau
```

#### **Solution 3: Sử dụng Schema Migration**

Sử dụng feature "Schema Migration" để đồng bộ structure, sau đó chỉnh sửa relations nếu cần.

## Best Practices

### ✅ DO:

- **Luôn chạy Schema Migration trước** để đảm bảo collections tồn tại
- **Validate trước khi migrate** bằng button "Validate Migration"
- **Kiểm tra warnings** về system collection dependencies
- **Backup dữ liệu target** trước khi migration
- **Test với một vài collections nhỏ** trước khi migrate toàn bộ

### ❌ DON'T:

- **Không migrate khi có circular dependencies** mà chưa xử lý
- **Không bỏ qua warnings** về ID mapping
- **Không close modal** khi migration đang chạy
- **Không sắp xếp lại** sai dependencies (system sẽ cảnh báo)

## Troubleshooting

### Problem: "Invalid migration order"

**Cause:** Bạn đã sắp xếp collection con trước collection cha

**Solution:** Sử dụng nút ▲▼ để đưa collection cha lên trước

---

### Problem: Circular dependency detected

**Cause:** Collections có quan hệ vòng tròn

**Solution:** 
1. Xem phần "Xử lý Circular Dependencies" ở trên
2. Hoặc migrate từng collection riêng lẻ và skip foreign keys tạm thời

---

### Problem: "Collection has relations to system collections"

**Cause:** Collection có foreign key đến `directus_users`, `directus_files`, etc.

**Solution:**
- Đảm bảo IDs của users/files match giữa source và target
- Hoặc tạo ID mapping table để transform data
- Xem `SCHEMA_MIGRATION_IMPROVEMENTS.md` để biết thêm chi tiết

---

### Problem: Migration failed for some collections

**Cause:** Nhiều nguyên nhân (permissions, data validation, etc.)

**Solution:**
1. Check Error Logs (button "🚨 Error Logs" ở góc trên)
2. Fix lỗi trên target environment
3. Chạy lại migration chỉ cho collections failed

---

## Technical Details

### Dependency Analysis Algorithm

```typescript
// 1. Build dependency graph from schema relations
const graph = analyzeDependencies(relations);

// 2. Topological sort (DFS)
const order = calculateMigrationOrder(graph, selectedCollections);

// 3. Detect cycles
if (order.cycles.length > 0) {
  // Warn user
}

// 4. Validate custom order (if user reordered)
const validation = validateCustomOrder(graph, customOrder);
```

### Migration Execution

```typescript
for (const collection of orderedCollections) {
  try {
    // Import với progress tracking
    await importFromDirectus(
      sourceUrl, sourceToken,
      targetUrl, targetToken,
      collection,
      { limit, onProgress }
    );
    
    results.push({ collection, success: true });
  } catch (error) {
    results.push({ collection, success: false, error });
    // Continue với collection tiếp theo
  }
}
```

## Examples

### Example 1: E-commerce Migration

```
Selected Collections:
☑ categories
☑ products
☑ product_variants
☑ customers
☑ orders
☑ order_items

Auto-calculated Order:
1. categories
2. customers
3. products
4. product_variants (depends on: products)
5. orders (depends on: customers)
6. order_items (depends on: orders, product_variants)

✅ No circular dependencies
✅ Ready to migrate
```

### Example 2: Blog Migration with System Relations

```
Selected Collections:
☑ posts
☑ comments
☑ tags

Warnings:
⚠️ posts has relations to: directus_users (user_created)
⚠️ comments has relations to: directus_users (author)

Migration Order:
1. tags
2. posts (system relation: user_created)
3. comments (depends on: posts; system relation: author)

⚠️ Action Required:
Ensure user IDs are mapped between source and target
```

## Future Improvements

- [ ] Auto ID mapping cho system collections
- [ ] Parallel migration cho independent collections
- [ ] Dry-run mode để preview kết quả
- [ ] Export migration plan ra JSON
- [ ] Resume từ collection bị failed

---

**Happy Migrating! 🚀**

Nếu có vấn đề, check Error Logs hoặc xem MIGRATION_STRATEGIES.md
