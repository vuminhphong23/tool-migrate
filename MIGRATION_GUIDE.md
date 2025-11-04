# Data Migration Guide

## Vấn đề đã được sửa

### 1. ✅ Xử lý quan hệ giữa các collections
**Vấn đề:** Khi migrate data, nếu collection A có foreign key tới collection B nhưng B chưa được import, sẽ gây lỗi constraint.

**Giải pháp:** Thêm option `skipRelationFields` để bỏ qua các field quan hệ trong lần import đầu tiên.

### 2. ✅ Update data đã tồn tại
**Vấn đề:** Logic cũ không check item có tồn tại hay không trước khi thực hiện action, dẫn đến việc update không hoạt động đúng.

**Giải pháp:** 
- Check item tồn tại trước bằng GET request
- Nếu tồn tại → UPDATE (PATCH)
- Nếu không tồn tại → CREATE (POST)

## Workflow Migration đúng cách

### Bước 1: Schema Migration (Bắt buộc)
Chạy Schema Migration trước khi import data:
1. Click "1️⃣ Get Schema Snapshot"
2. Click "2️⃣ Compare Schemas"
3. Chọn collections cần migrate
4. Click "3️⃣ Apply to Target"

### Bước 2: Data Migration

Bạn có **2 cách** để migrate data:

#### Cách 1: Import All (Toàn bộ collection)

**Lần 1 - Không có relations:**
1. Mở "Collection Import Options"
2. ✅ **Bật checkbox "Skip Relation Fields"**
3. Click "Import All" cho từng collection
4. Data sẽ được import nhưng các field quan hệ sẽ bị bỏ qua

**Lần 2 - Có relations:**
1. Mở "Collection Import Options"
2. ❌ **Tắt checkbox "Skip Relation Fields"**
3. Click "Import All" lại
4. Field quan hệ sẽ được update vào data đã tồn tại

#### Cách 2: Select Items (Chọn từng items) ⭐ MỚI

**Khi nào dùng:** Khi bạn có 1000 items nhưng chỉ muốn migrate 50 items cụ thể.

**Workflow:**
1. Click "📋 Select Items" trên collection
2. Modal hiển thị danh sách items (load 100 items đầu tiên)
3. Sử dụng search box để tìm items
4. Tick checkbox để chọn items muốn migrate
5. Click "Select All" để chọn tất cả (hoặc bỏ chọn tất cả)
6. Click "Load More Items" nếu cần xem thêm
7. Click "Import Selected (X)" để migrate chỉ những items đã chọn

**Lợi ích:**
- ✅ Tiết kiệm thời gian (không cần migrate 1000 items nếu chỉ cần 50)
- ✅ Kiểm soát chính xác data nào được migrate
- ✅ Preview data trước khi migrate
- ✅ Search và filter items dễ dàng

## Các field được bỏ qua khi "Skip Relation Fields" enabled

- Tất cả fields kết thúc bằng `_id` (ví dụ: `client_id`, `category_id`)
- Các fields thường dùng cho relations: `client`, `site`, `services`, `category`, `author`, `parent`

## Kết quả Import

Sau khi import, bạn sẽ thấy thông báo chi tiết:
```
Import complete for [collection_name]: X created, Y updated, Z failed
```

- **Created:** Số items mới được tạo
- **Updated:** Số items đã tồn tại được cập nhật
- **Failed:** Số items bị lỗi

## Xử lý lỗi

### Lỗi Foreign Key Constraint
```
Error: Foreign key constraint failed
```
**Giải pháp:** Bật "Skip Relation Fields" và import lại

### Lỗi Update không hoạt động
```
Error: Item not found or update failed
```
**Giải pháp:** 
- Check xem item có tồn tại trong target không
- Xem error logs để biết chi tiết (Click "🚨 Error Logs")

### Lỗi Duplicate Key
```
Error: Duplicate key value violates unique constraint
```
**Giải pháp:** Item đã tồn tại, logic mới sẽ tự động update thay vì tạo mới

## Tips

1. **Import theo thứ tự:** Import collections không có dependencies trước (ví dụ: categories, tags) rồi mới import collections có relations (ví dụ: posts, products)

2. **Sử dụng Import Limit:** Test với số lượng nhỏ trước (ví dụ: 10 items) để đảm bảo mọi thứ hoạt động đúng

3. **Check Error Logs:** Luôn check error logs sau mỗi lần import để phát hiện vấn đề sớm

4. **Schema Migration trước:** Đảm bảo schema đã được migrate đúng trước khi import data

## Ví dụ thực tế

### Scenario: Import blog system với relations

**Collections:**
- `categories` (không có relations)
- `authors` (không có relations)
- `posts` (có relations: `category_id`, `author_id`)
- `comments` (có relations: `post_id`, `author_id`)

**Workflow:**

1. **Schema Migration:** Migrate tất cả collections

2. **Data Migration - Lần 1 (Skip Relations = ON):**
   - Import `categories` → 50 created
   - Import `authors` → 20 created
   - Import `posts` → 100 created (không có category_id, author_id)
   - Import `comments` → 500 created (không có post_id, author_id)

3. **Data Migration - Lần 2 (Skip Relations = OFF):**
   - Import `posts` → 0 created, 100 updated (thêm category_id, author_id)
   - Import `comments` → 0 created, 500 updated (thêm post_id, author_id)

**Kết quả:** Tất cả data được import đầy đủ với relations đúng!

## Code Changes Summary

### File: `src/lib/apiHandlers.ts`

**Thêm functions mới:**
```typescript
// Preview items từ collection
previewCollectionItems(sourceUrl, sourceToken, collectionName, options?)

// Import chỉ selected items
importSelectedItems(sourceUrl, sourceToken, targetUrl, targetToken, collectionName, selectedIds, options?)
```

**Thêm options mới:**
```typescript
options?: {
  limit?: number;
  titleFilter?: string;
  skipRelationFields?: boolean; // NEW - Bỏ qua relation fields
  forceUpdate?: boolean; // NEW
  onProgress?: (current: number, total: number) => void;
}
```

**Logic mới:**
1. Check item exists trước
2. Nếu exists → UPDATE
3. Nếu không exists → CREATE
4. Nếu skipRelationFields = true → Remove relation fields

### File: `src/components/CollectionList.tsx`

**Thêm state:**
```typescript
const [skipRelationFields, setSkipRelationFields] = useState<boolean>(false)
const [showItemSelector, setShowItemSelector] = useState(false)
const [previewItems, setPreviewItems] = useState<any[]>([])
const [selectedItemIds, setSelectedItemIds] = useState<(string | number)[]>([])
```

**Thêm UI:**
- Checkbox "Skip Relation Fields"
- Button "📋 Select Items" (mới)
- Button "Import All" (đổi tên từ "Import from Source")
- Modal để preview và select items
- Hiển thị kết quả chi tiết (created/updated/failed)

### File: `src/components/ItemSelectorModal.tsx` (MỚI)

Component modal để:
- Hiển thị danh sách items từ collection
- Search/filter items
- Select/deselect items với checkbox
- Load more items (pagination)
- Import selected items
