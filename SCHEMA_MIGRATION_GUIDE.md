# Hướng Dẫn Schema Migration

Tài liệu hướng dẫn migrate schema giữa hai Directus instances, bao gồm:

- Chọn collections để migrate
- Trường (fields), relations, validation rules
- Chính sách với system collections (`directus_*`)

---

## Yêu Cầu

1. Có quyền truy cập Directus (admin token) cho cả source và target
2. Target schema empty: tool sẽ tạo mới collections/fields theo diff
3. Khuyến nghị: Backup target trước khi apply

---

## Tổng Quan Quy Trình

1. Tạo snapshot schema từ source

2. Gửi snapshot sang target để tạo diff → Hiển thị thay đổi dự kiến (collections/fields/relations/validation)

3. Chọn collections cần migrate → Apply diff lên target

---

## Chính Sách Với System Collections

- Bỏ qua toàn bộ schema của system collections (`directus_*`) khi snapshot/diff/apply
- GIỮ LẠI các relations từ user collections → system collections (ví dụ: `posts.user_created → directus_users`, `articles.image → directus_files`)
- Loại bỏ relations có nguồn là system collections (ví dụ: `directus_users.* → posts`)

Kết quả:

- ✅ User → System relations được migrate an toàn
- ❌ System → Anything bị loại bỏ để bảo vệ hệ thống

---

## Cách Thực Hiện Trên UI Tool

1. Mở tab Schema Migration
2. Nhập `Source URL`, `Source Admin Token`, `Target URL`, `Target Admin Token`
3. Bấm “Scan Schema” để lấy snapshot và tính diff
4. Xem danh sách collections và thay đổi chi tiết
5. Tick chọn collections cần migrate
6. Bấm “Apply Schema” để thực thi

Giao diện hiển thị:

- Badge trạng thái: `New`, `Existing`, `Changed`, `Unchanged`
- Chi tiết thay đổi cho từng collection: fields thêm/sửa/xóa, relations, validations

---

## Chi Tiết Thành Phần Schema

### Collections

- Tạo mới nếu chưa tồn tại trên target
- Không xóa collection trên target (an toàn mặc định)

### Fields

- Hỗ trợ tạo/sửa field type, `required`, `default`, `unique`, `readonly`
- Áp dụng validation rules chi tiết (xem mục tiếp theo)

### Relations

- Giữ lại relations từ user collections đến system collections (`directus_users`, `directus_files`, ...)
- Bỏ relations có nguồn là system collections

### Validation Rules (được phân tích chi tiết)

Các rule được detect và hiển thị rõ: `_regex`, `_in`, `_nin`, `_eq`, `_neq`, `_gt`, `_gte`, `_lt`, `_lte`, `_contains`, `_ncontains`, `_starts_with`, `_ends_with`, `_between`, `_nbetween`, `_empty`, `_null`, `_and`, `_or`.

Ví dụ hiển thị:

```
Validation sẽ áp dụng: Min value: 18, Max value: 100
Custom message: "Age must be between 18 and 100"
```

---

## Thứ Tự Khuyến Nghị Khi Migrate Tổng Thể

1. Schema Migration (tài liệu này)
2. Files (nếu có `directus_files` liên quan)
3. Data Migration (xem `DATA_MIGRATION_GUIDE.md`)
4. Update relations bằng Data Migration (Two-Pass cho collections có foreign keys)

Lý do: cần có schema trước để import data; files và users/system entities cần sẵn sàng để map.

---

## Lưu Ý Quan Trọng

- ⚠️ Không xóa tự động fields/relations trên target trừ khi có xác nhận rõ (tool mặc định an toàn)
- ⚠️ ID mapping cho relations tới system collections sẽ ảnh hưởng ở bước Data Migration
- ✅ Có thể chạy nhiều lần; apply theo diff chỉ áp dụng thay đổi cần thiết
- ✅ Tool tự xử lý lọc relations theo chính sách user → system

---

## Troubleshooting

### 1) Diff không hiển thị hoặc rỗng

- Nguyên nhân: Source và target giống hệt hoặc token/URL sai
- Cách xử lý: Kiểm tra cấu hình, thử “Scan Schema” lại

### 2) Apply lỗi khi tạo/sửa field

- Nguyên nhân: Ràng buộc/validation không hợp lệ hoặc type conflict
- Cách xử lý: Xem log chi tiết, điều chỉnh field type hoặc validation tại source cho đồng nhất

### 3) Relations tới system collections không xuất hiện

- Nguyên nhân: Relation có nguồn là system collection (bị loại theo chính sách)
- Cách xử lý: Chỉ các relations từ user collections → system collections được giữ

### 4) Apply thành công nhưng Data Migration lỗi 403/400

- Nguyên nhân: Data có foreign keys tới collections chưa có data trên target
- Cách xử lý: Dùng Two-Pass trong Data Migration (import regular fields trước, update relations sau)

---

## Tham Chiếu API Liên Quan

- `getSchemaSnapshot(sourceUrl, sourceToken)`

  - Lấy snapshot schema từ source; đã lọc system collections và giữ relations user → system

- `getSchemaDiff(targetUrl, targetToken, filteredSnapshot)`

  - Tạo diff trên target từ snapshot đã lọc; trả về thay đổi chi tiết

- `applySchemaDiff(targetUrl, targetToken, filteredDiff, { selectedSchemaCollections })`
  - Apply các thay đổi đã chọn; vẫn áp dụng chính sách relations user → system

---

Phiên bản: 1.0 (tối giản cho Schema Migration)
