# Relasi database fondasi

```mermaid
erDiagram
  USERS ||--o{ USER_SESSIONS : memiliki
  USERS ||--o{ PROJECT_MEMBERS : ditugaskan
  PROJECTS ||--o{ PROJECT_MEMBERS : memiliki
  USERS ||--o{ PROJECT_FAVORITES : menyimpan
  PROJECTS ||--o{ PROJECT_FAVORITES : difavoritkan
```

Keanggotaan dan favorit memakai primary key gabungan agar asosiasi unik. Token sesi disimpan sebagai hash SHA-256. Status dan deadline proyek diindeks untuk pembacaan portofolio. Migrasi pertama membuat tabel dengan charset utf8mb4.
