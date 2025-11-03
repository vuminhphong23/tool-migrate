# Schema Migration Improvements

## Các cải tiến đã thực hiện

### 1. ✅ Giữ lại Relations với System Collections

**Vấn đề cũ:**
- Code lọc bỏ tất cả relations có `related_collection` là system collection
- Gây mất mối quan hệ khi user collection trỏ đến `directus_users`, `directus_files`, etc.

**Giải pháp mới:**
```typescript
// Trong handleSchemaDiff - khi tạo snapshot
relations: (schemaSnapshot.relations || []).filter((relation: any) => {
  // Chỉ loại bỏ nếu SOURCE là system collection
  // GIỮ LẠI relations: user collection → system collection
  return !relation.collection?.startsWith('directus_');
})

// Trong handleSchemaApply - khi apply changes
relations: (schemaDiff.diff.relations || []).filter((rel: any) => {
  const isSourceSystem = rel?.collection?.startsWith('directus_');
  const isSourceSelected = selectedSchemaCollections.includes(rel?.collection);
  
  if (isSourceSystem) return false; // Loại bỏ system → anything
  if (isSourceSelected) return true; // GIỮ LẠI user → system
  
  return false;
})
```

**Kết quả:**
- ✅ `posts.user_created` → `directus_users` **ĐƯỢC MIGRATE**
- ✅ `articles.image` → `directus_files` **ĐƯỢC MIGRATE**
- ✅ `products.created_by` → `directus_users` **ĐƯỢC MIGRATE**
- ❌ `directus_users.posts` → `posts` **BỊ LOẠI BỎ** (bảo vệ system)

---

### 2. ✅ Validation Rules Chi Tiết

**Vấn đề cũ:**
- Chỉ hiển thị "Has validation rules: {...}"
- Không phân tích chi tiết loại validation

**Giải pháp mới:**
Phân tích và hiển thị chi tiết từng loại validation rule:

#### Các validation rules được detect:

| Rule | Mô tả | Ví dụ |
|------|-------|-------|
| `_regex` | Regex pattern | `^[A-Z0-9]+$` |
| `_in` | Allowed values | `["active", "inactive"]` |
| `_nin` | Forbidden values | `["banned", "deleted"]` |
| `_eq` | Must equal | `"published"` |
| `_neq` | Must not equal | `"draft"` |
| `_gt` / `_gte` | Greater than | `> 0` hoặc `>= 18` |
| `_lt` / `_lte` | Less than | `< 100` hoặc `<= 999` |
| `_contains` | Must contain | `"@gmail.com"` |
| `_ncontains` | Must not contain | `"spam"` |
| `_starts_with` | Starts with | `"https://"` |
| `_ends_with` | Ends with | `".jpg"` |
| `_between` | Between range | `[10, 100]` |
| `_nbetween` | Not between | `[0, 5]` |
| `_empty` | Must be empty | `true/false` |
| `_null` | Must be null | `true/false` |
| `_and` / `_or` | Complex logic | Multiple conditions |

**Ví dụ output:**

Thay vì:
```
⚠️ Has validation rules: {"_gte":18,"_lte":100}
```

Bây giờ:
```
⚠️ Validation rules will be applied: Min value: 18, Max value: 100
```

**Thêm validation message:**
```
⚠️ Custom validation message: "Age must be between 18 and 100"
```

---

## Test Cases

### Test 1: User Collection → System Collection
```
Collection: posts
Field: user_created → directus_users

✅ Expected: Relation được migrate
✅ Warning: "Relation to system collection - requires ID mapping"
```

### Test 2: Complex Validation
```
Collection: products
Field: price
Validation: { "_gte": 0, "_lte": 999999, "_neq": null }

✅ Expected: Hiển thị "Min value: 0, Max value: 999999, Must not be null"
```

### Test 3: Regex Validation
```
Collection: users
Field: phone
Validation: { "_regex": "^\\+84[0-9]{9}$" }
Validation Message: "Phone must be Vietnamese format"

✅ Expected: 
- "Regex pattern: ^\\+84[0-9]{9}$"
- "Custom validation message: Phone must be Vietnamese format"
```

---

## Migration Flow

### Bước 1: Schema Snapshot
```
Source → Get /schema/snapshot
↓
Filter: Loại bỏ system collections
Keep: Relations user → system
```

### Bước 2: Schema Diff
```
Target ← POST /schema/diff (filtered snapshot)
↓
Response: Diff data với validation details
↓
Validate: Phân tích validation rules chi tiết
```

### Bước 3: Schema Apply
```
User selects collections
↓
Filter diff: Keep relations user → system
↓
Target ← POST /schema/apply (filtered diff)
```

---

## Lưu ý quan trọng

### ⚠️ ID Mapping cho System Relations

Khi migrate data sau khi schema đã được tạo:

**Vấn đề:**
- Source: `user_created = "abc-123"` (UUID của user trong source)
- Target: User đó có UUID khác `"xyz-789"`

**Giải pháp:**
1. Export mapping table: `source_user_id → target_user_id`
2. Transform data trước khi import
3. Hoặc sử dụng email/username làm key để map

**Code example:**
```javascript
// Pseudo code
const userMapping = {
  "abc-123": "xyz-789",  // source → target
  "def-456": "uvw-012"
};

// Transform data
posts.forEach(post => {
  post.user_created = userMapping[post.user_created];
});
```

---

## Checklist

- [x] Relations user → system được giữ lại trong snapshot
- [x] Relations user → system được giữ lại khi apply
- [x] Validation rules được phân tích chi tiết
- [x] Hiển thị validation message
- [x] Warning về ID mapping cho system relations
- [x] UI hiển thị validation results đầy đủ
- [x] Documentation đầy đủ

---

## Kết luận

✅ **Yêu cầu 1:** Relations với system collections **KHÔNG BỊ LOẠI BỎ**  
✅ **Yêu cầu 2:** Validation rules được **PHÂN TÍCH CHI TIẾT**, không chỉ check có/không

Schema migration giờ đây an toàn và đầy đủ thông tin hơn! 🎉
