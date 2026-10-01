# Our Journey

Bản đồ, danh sách check-in và lịch các nơi đã đi.

## Thêm ảnh mới

1. Chép ảnh gốc vào `pictures/`. Thư mục này chỉ nằm trên máy, không được đẩy lên GitHub.
2. Trong `places.js`, ghi đường dẫn ảnh gốc như bình thường, ví dụ `"pictures/ten-anh.png"`.
3. Chạy (cần Pillow: `pip install pillow`):

   ```
   python tools/optimize_photos.py
   ```

   Script tạo bản cho web trong `photos/` (tối đa 1600px) và ảnh nhỏ trong `photos/thumbs/` (480px),
   xoá thông tin trong ảnh (kể cả vị trí GPS), rồi tự đổi đường dẫn trong `places.js` sang `photos/...`.
4. Commit `photos/` và `places.js`.

Video trong `videos/` được dùng trực tiếp, nên nén trước khi thêm, ví dụ bằng ffmpeg:

```
ffmpeg -i in.mp4 -vf scale=-2:720 -c:v libx264 -crf 28 -preset slow -c:a aac -b:a 96k -movflags +faststart out.mp4
```
