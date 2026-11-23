# Trackit API Documentation

This document describes all API endpoints for the Trackit backend, including authentication requirements, request schemas, validation rules, error codes, and verbatim example responses generated from real feature tests.

---

## 1. Authentication & Base Conventions

- **Base URL path**: `/api`
- **Default Headers**:
  - `Accept: application/json`
  - `Content-Type: application/json`
- **Authentication**:
  - Endpoints marked **Authenticated** require a Laravel Sanctum Bearer token passed in the `Authorization` header:
    ```http
    Authorization: Bearer <personal-access-token>
    ```
  - Unauthenticated requests return `401 Unauthorized`:
    ```json
    {
      "message": "Unauthenticated."
    }
    ```
- **Standard Error Responses**:
  - `401 Unauthorized`: Missing or invalid Bearer token / credentials.
  - `403 Forbidden`: Authenticated user does not own the requested track, activity, or log.
  - `404 Not Found`: Model or route does not exist, or entity does not belong to parent.
  - `409 Conflict`: Business logic violation with a specific string `code` (`timezone_locked`, `track_started`, `activities_locked`).
  - `422 Unprocessable Content`: Validation failure returning a `message` and `errors` map, or business rule failure with a specific string `code` (`activity_limit_reached`, `log_date_out_of_range`).

---

## 2. Authentication & User Endpoints

### 2.1 Register
- **Method**: `POST`
- **URL**: `/api/register`
- **Authentication**: None (Public)
- **Request Body**:
  | Field | Type | Rules | Description |
  |---|---|---|---|
  | `name` | string | `required`, `string`, `max:255` | User's full name |
  | `email` | string | `required`, `email`, `unique:users,email` | Unique email address |
  | `password` | string | `required`, `string`, `min:8` | Account password (minimum 8 characters; no confirmation required) |
  | `timezone` | string | `required`, `string`, `timezone:all` | Valid IANA timezone identifier (e.g. `America/New_York`) |
- **Success Status**: `201 Created`
- **Example Response**:
```json
{
  "token": "1|q7dxGXZVbBzleKFEu9ew1iES3vWw1xXugmPwqWVd10efd652",
  "user": {
    "name": "Jane Doe",
    "email": "jane.doe@example.com",
    "timezone": "America/New_York",
    "updated_at": "2026-06-15T12:00:00.000000Z",
    "created_at": "2026-06-15T12:00:00.000000Z",
    "id": 1
  }
}
```
- **Error Codes**:
  - `422 Unprocessable Content`: Missing fields, duplicate email, invalid timezone, or password < 8 characters.

---

### 2.2 Login
- **Method**: `POST`
- **URL**: `/api/login`
- **Authentication**: None (Public)
- **Request Body**:
  | Field | Type | Rules | Description |
  |---|---|---|---|
  | `email` | string | `required`, `email` | Registered account email |
  | `password` | string | `required`, `string` | Account password |
- **Success Status**: `200 OK`
- **Example Response**:
```json
{
  "token": "2|zUsYvoKbYX3Ebqm6ecQUPrwYHOzdGnDvoEyh4EQV4cd6b5b0",
  "user": {
    "id": 1,
    "name": "Jane Doe",
    "email": "jane.doe@example.com",
    "email_verified_at": null,
    "created_at": "2026-06-15T12:00:00.000000Z",
    "updated_at": "2026-06-15T12:00:00.000000Z",
    "timezone": "America/New_York"
  }
}
```
- **Error Codes**:
  - `401 Unauthorized`: `{"message": "Invalid credentials."}`
  - `422 Unprocessable Content`: Missing email or password.

---

### 2.3 Logout
- **Method**: `POST`
- **URL**: `/api/logout`
- **Authentication**: Bearer Token
- **Request Body**: None
- **Success Status**: `200 OK`
- **Example Response**:
```json
{
  "message": "Logged out."
}
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.

---

### 2.4 Get Current User Profile
- **Method**: `GET`
- **URL**: `/api/me`
- **Authentication**: Bearer Token
- **Request Body**: None
- **Success Status**: `200 OK`
- **Example Response**:
```json
{
  "id": 1,
  "name": "Jane Doe",
  "email": "jane.doe@example.com",
  "email_verified_at": null,
  "created_at": "2026-06-15T12:00:00.000000Z",
  "updated_at": "2026-06-15T12:00:00.000000Z",
  "timezone": "America/New_York"
}
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.

---

### 2.5 Update Current User Profile
- **Method**: `PATCH`
- **URL**: `/api/me`
- **Authentication**: Bearer Token
- **Request Body** (all fields optional):
  | Field | Type | Rules | Description |
  |---|---|---|---|
  | `name` | string | `sometimes`, `string`, `max:255` | User's updated name |
  | `email` | string | `sometimes`, `email`, `unique:users,email,{id}` | Updated email address (must be unique across users) |
  | `current_password` | string | `required` if `email` changed; `current_password` | Required whenever `email` changes |
  | `timezone` | string | `sometimes`, `string`, `timezone:all` | Valid IANA timezone identifier |
- **Business Rules**:
  - If `email` changes, `current_password` is required and verified against the user's password. Submitting the existing email unchanged does not require `current_password`.
  - If `timezone` is provided and the authenticated user has any track whose computed status is `active`, the request is rejected with HTTP `409` and code `timezone_locked`.
  - Returns the updated user in the same shape as `GET /api/me`.
- **Success Status**: `200 OK`
- **Example Response**:
```json
{
  "id": 1,
  "name": "Jane Smith",
  "email": "jane.smith@example.com",
  "email_verified_at": null,
  "created_at": "2026-06-15T12:00:00.000000Z",
  "updated_at": "2026-06-15T12:00:00.000000Z",
  "timezone": "Europe/London"
}
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `409 Conflict`: `{"message": "Timezone cannot be changed while you have an active track.", "code": "timezone_locked"}`
  - `422 Unprocessable Content`: Invalid email format, duplicate email, missing or wrong `current_password` when changing email, or invalid IANA timezone identifier.

---

## 3. Tracks Endpoints

### 3.1 List Tracks
- **Method**: `GET`
- **URL**: `/api/tracks`
- **Authentication**: Bearer Token
- **Query Parameters**:
  | Parameter | Type | Description |
  |---|---|---|
  | `include` | string | Optional. Set to `progress` to include the compact progress summary for each track. |

#### Case A: Standard (`GET /api/tracks`)
Does not include the `progress` key.
- **Success Status**: `200 OK`
- **Example Response**:
```json
[
  {
    "id": 1,
    "user_id": 1,
    "name": "Coding Sprint",
    "description": "Build daily open-source habits",
    "start_date": "2026-06-16",
    "end_date": "2026-07-15",
    "duration_days": 30,
    "status": "upcoming",
    "created_at": "2026-06-15T12:00:00.000000Z",
    "updated_at": "2026-06-15T12:00:00.000000Z"
  },
  {
    "id": 2,
    "user_id": 1,
    "name": "Fitness Challenge",
    "description": "30-day health transformation",
    "start_date": "2026-06-10",
    "end_date": "2026-07-09",
    "duration_days": 30,
    "status": "active",
    "created_at": "2026-06-15T12:00:00.000000Z",
    "updated_at": "2026-06-15T12:00:00.000000Z"
  }
]
```

#### Case B: With Progress (`GET /api/tracks?include=progress`)
Each track includes a `progress` object:
- `overall_percentage`: float (0–100) average daily completion over elapsed days.
- `challenge_progress`: float (0–100) cumulative progress against the entire challenge duration.
- `completed_days`: integer count of days meeting 100% completion.
- `elapsed_days`: integer count of days elapsed from track start to today (or end date if expired; 0 if upcoming).
- `total_days`: integer track duration.
- `days_remaining`: integer remaining days in the challenge.
- `today`: object containing `{date, day_status, completion_percentage}` or `null` if today is outside the track window.
- **Success Status**: `200 OK`
- **Example Response**:
```json
[
  {
    "id": 1,
    "user_id": 1,
    "name": "Coding Sprint",
    "description": "Build daily open-source habits",
    "start_date": "2026-06-16",
    "end_date": "2026-07-15",
    "duration_days": 30,
    "status": "upcoming",
    "created_at": "2026-06-15T12:00:00.000000Z",
    "updated_at": "2026-06-15T12:00:00.000000Z",
    "progress": {
      "overall_percentage": 0,
      "challenge_progress": 0,
      "completed_days": 0,
      "elapsed_days": 0,
      "total_days": 30,
      "days_remaining": 30,
      "today": null
    }
  },
  {
    "id": 2,
    "user_id": 1,
    "name": "Fitness Challenge",
    "description": "30-day health transformation",
    "start_date": "2026-06-10",
    "end_date": "2026-07-09",
    "duration_days": 30,
    "status": "active",
    "created_at": "2026-06-15T12:00:00.000000Z",
    "updated_at": "2026-06-15T12:00:00.000000Z",
    "progress": {
      "overall_percentage": 19.5,
      "challenge_progress": 3.9,
      "completed_days": 0,
      "elapsed_days": 6,
      "total_days": 30,
      "days_remaining": 24,
      "today": {
        "date": "2026-06-15",
        "day_status": "partial",
        "completion_percentage": 33.3
      }
    }
  }
]
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.

---

### 3.2 Create Track
- **Method**: `POST`
- **URL**: `/api/tracks`
- **Authentication**: Bearer Token
- **Request Body**:
  | Field | Type | Rules | Description |
  |---|---|---|---|
  | `name` | string | `required`, `string`, `max:255` | Track name |
  | `description` | string | `sometimes`, `nullable`, `string` | Optional description |
  | `start_date` | string | `required`, `date`, strictly tomorrow or later in user timezone | Track start date (`YYYY-MM-DD`) |
  | `duration_days` | integer | `required`, `integer`, `min:1` | Total duration in calendar days |
  | `user_id` | any | `prohibited` | Assigned automatically from authenticated user |
  | `status` | any | `prohibited` | Computed dynamically from dates |
- **Success Status**: `201 Created`
- **Example Response**:
```json
{
  "id": 1,
  "user_id": 1,
  "name": "Coding Sprint",
  "description": "Build daily open-source habits",
  "start_date": "2026-06-16",
  "end_date": "2026-07-15",
  "duration_days": 30,
  "status": "upcoming",
  "created_at": "2026-06-15T12:00:00.000000Z",
  "updated_at": "2026-06-15T12:00:00.000000Z"
}
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `422 Unprocessable Content`: Missing required fields, `start_date` in the past or today, `duration_days` < 1, or prohibited fields submitted.

---

### 3.3 Show Track
- **Method**: `GET`
- **URL**: `/api/tracks/{track}`
- **Authentication**: Bearer Token
- **Success Status**: `200 OK`
- **Example Response**:
```json
{
  "id": 2,
  "user_id": 1,
  "name": "Fitness Challenge",
  "description": "30-day health transformation",
  "start_date": "2026-06-10",
  "end_date": "2026-07-09",
  "duration_days": 30,
  "status": "active",
  "created_at": "2026-06-15T12:00:00.000000Z",
  "updated_at": "2026-06-15T12:00:00.000000Z"
}
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Track belongs to another user.
  - `404 Not Found`: Track ID does not exist.

---

### 3.4 Update Track
- **Method**: `PUT` / `PATCH`
- **URL**: `/api/tracks/{track}`
- **Authentication**: Bearer Token
- **Request Body**:
  | Field | Type | Rules | Description |
  |---|---|---|---|
  | `name` | string | `sometimes`, `string`, `max:255` | Updated track name |
  | `description` | string | `sometimes`, `nullable`, `string` | Updated description |
  | `start_date` | string | `sometimes`, `date`, tomorrow or later | Can only be updated while track is `upcoming` |
  | `duration_days` | integer | `sometimes`, `integer`, `min:1` | Can only be updated while track is `upcoming` |
- **Schedule Lock**: If track status is `active` or `expired`, changing `start_date` or `duration_days` is rejected with HTTP `409` and code `track_started`.
- **Success Status**: `200 OK`
- **Example Response**:
```json
{
  "id": 3,
  "user_id": 1,
  "name": "Half Marathon Training",
  "description": "Prepare for autumn half marathon",
  "start_date": "2026-06-22",
  "end_date": "2026-07-12",
  "duration_days": 21,
  "status": "upcoming",
  "created_at": "2026-06-15T12:00:00.000000Z",
  "updated_at": "2026-06-15T12:00:00.000000Z"
}
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Track belongs to another user.
  - `409 Conflict`: `{"message": "The track schedule cannot be changed after it has started.", "code": "track_started"}`
  - `422 Unprocessable Content`: Validation failure on fields.

---

### 3.5 Delete Track
- **Method**: `DELETE`
- **URL**: `/api/tracks/{track}`
- **Authentication**: Bearer Token
- **Success Status**: `204 No Content`
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Track belongs to another user.
  - `404 Not Found`: Track does not exist.

---

## 4. Activities & Templates Endpoints

### 4.1 Activity Templates
- **Method**: `GET`
- **URL**: `/api/activity-templates`
- **Authentication**: Bearer Token
- **Success Status**: `200 OK`
- **Example Response**:
```json
[
  {
    "key": "chess_games",
    "name": "Chess Games",
    "description": "Play full chess games to build practical experience.",
    "tracking_type": "count",
    "daily_target": 2,
    "unit": "games"
  },
  {
    "key": "chess_puzzles",
    "name": "Chess Puzzles",
    "description": "Solve tactical puzzles to sharpen calculation.",
    "tracking_type": "count",
    "daily_target": 10,
    "unit": "puzzles"
  },
  {
    "key": "opening_study",
    "name": "Opening Study",
    "description": "Study opening theory and repertoire.",
    "tracking_type": "duration",
    "daily_target": 20,
    "unit": "minutes"
  },
  {
    "key": "chess_lessons",
    "name": "Chess Lessons",
    "description": "Take a structured lesson or watch instructional content.",
    "tracking_type": "checkbox",
    "daily_target": 1,
    "unit": null
  }
]
```

---

### 4.2 List Activities for Track
- **Method**: `GET`
- **URL**: `/api/tracks/{track}/activities`
- **Authentication**: Bearer Token
- **Success Status**: `200 OK`
- **Example Response**:
```json
[
  {
    "id": 2,
    "track_id": 2,
    "name": "Pushups",
    "description": "Daily pushup reps",
    "tracking_type": "count",
    "daily_target": 50,
    "unit": "reps",
    "is_required": true,
    "created_at": "2026-06-15T12:00:00.000000Z",
    "updated_at": "2026-06-15T12:00:00.000000Z"
  },
  {
    "id": 3,
    "track_id": 2,
    "name": "Meditation",
    "description": "Morning mindfulness practice",
    "tracking_type": "duration",
    "daily_target": 15,
    "unit": "minutes",
    "is_required": false,
    "created_at": "2026-06-15T12:00:00.000000Z",
    "updated_at": "2026-06-15T12:00:00.000000Z"
  },
  {
    "id": 4,
    "track_id": 2,
    "name": "No Sugar",
    "description": "Avoid processed sugar all day",
    "tracking_type": "checkbox",
    "daily_target": 1,
    "unit": null,
    "is_required": true,
    "created_at": "2026-06-15T12:00:00.000000Z",
    "updated_at": "2026-06-15T12:00:00.000000Z"
  }
]
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Track belongs to another user.
  - `404 Not Found`: Track does not exist.

---

### 4.3 Create Activity
- **Method**: `POST`
- **URL**: `/api/tracks/{track}/activities`
- **Authentication**: Bearer Token
- **Restrictions**: Activities can only be created while the track is `upcoming` (409 `activities_locked` if track is active or expired). Maximum of 20 activities per track (422 `activity_limit_reached`).
- **Request Body**:
  | Field | Type | Rules | Description |
  |---|---|---|---|
  | `name` | string | `required`, `string`, `max:255`, unique within track (case-insensitive) | Activity name |
  | `description` | string | `sometimes`, `nullable`, `string` | Optional description |
  | `tracking_type` | string | `required`, `in:count,duration,checkbox` | Metric tracking mode |
  | `daily_target` | integer | `required`, `integer`, `min:1` (must be `1` for `checkbox`) | Daily goal |
  | `unit` | string | `required` for `count`; must be `minutes` for `duration`; `prohibited` / `nullable` for `checkbox` | Display unit |
  | `is_required` | boolean | `required`, `boolean` | Whether activity is required for 100% daily score |
  | `track_id` | any | `prohibited` | Assigned from URL route |
- **Success Status**: `201 Created`
- **Example Response**:
```json
{
  "id": 1,
  "track_id": 3,
  "name": "Morning Jog",
  "description": "Run around the neighborhood park",
  "tracking_type": "duration",
  "daily_target": 30,
  "unit": "minutes",
  "is_required": true,
  "created_at": "2026-06-15T12:00:00.000000Z",
  "updated_at": "2026-06-15T12:00:00.000000Z"
}
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Track belongs to another user.
  - `409 Conflict`: `{"message": "Activities can no longer be changed because this track has started.", "code": "activities_locked"}`
  - `422 Unprocessable Content`: Validation failure on fields, or `{"message": "A track cannot have more than 20 activities.", "code": "activity_limit_reached"}`.

---

### 4.4 Show Activity
- **Method**: `GET`
- **URL**: `/api/tracks/{track}/activities/{activity}`
- **Authentication**: Bearer Token
- **Success Status**: `200 OK`
- **Example Response**:
```json
{
  "id": 2,
  "track_id": 2,
  "name": "Pushups",
  "description": "Daily pushup reps",
  "tracking_type": "count",
  "daily_target": 50,
  "unit": "reps",
  "is_required": true,
  "created_at": "2026-06-15T12:00:00.000000Z",
  "updated_at": "2026-06-15T12:00:00.000000Z"
}
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Track belongs to another user.
  - `404 Not Found`: Activity does not exist or does not belong to track.

---

### 4.5 Update Activity
- **Method**: `PUT` / `PATCH`
- **URL**: `/api/tracks/{track}/activities/{activity}`
- **Authentication**: Bearer Token
- **Rules based on Track State**:
  - **Upcoming Track**: All activity fields can be modified.
  - **Active or Expired Track**: Only `name` and `description` can be modified on active tracks. Modifying `tracking_type`, `daily_target`, `unit`, or `is_required` (or modifying any field on an expired track) returns HTTP `409` and code `activities_locked`.
- **Success Status**: `200 OK`
- **Example Response**:
```json
{
  "id": 1,
  "track_id": 3,
  "name": "Sunrise Jogging",
  "description": "Gentle tempo run in morning",
  "tracking_type": "duration",
  "daily_target": 30,
  "unit": "minutes",
  "is_required": true,
  "created_at": "2026-06-15T12:00:00.000000Z",
  "updated_at": "2026-06-15T12:00:00.000000Z"
}
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Unauthorized user.
  - `404 Not Found`: Not found.
  - `409 Conflict`: `{"message": "Activities can no longer be changed because this track has started.", "code": "activities_locked"}`
  - `422 Unprocessable Content`: Validation failure.

---

### 4.6 Delete Activity
- **Method**: `DELETE`
- **URL**: `/api/tracks/{track}/activities/{activity}`
- **Authentication**: Bearer Token
- **Rules**: Can only be deleted while track is `upcoming`. Active or expired tracks reject deletion with HTTP `409` and code `activities_locked`.
- **Success Status**: `204 No Content`
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Unauthorized user.
  - `409 Conflict`: `{"message": "Activities can no longer be changed because this track has started.", "code": "activities_locked"}`

---

## 5. Daily Logs Endpoints

### 5.1 Exact Log Field Specification

#### A. Single Log & History Responses (`formatLog`)
Returned by `PUT .../logs/{date}`, `GET .../logs/{date}`, and `GET .../logs`:
| Field Name | Type | Description |
|---|---|---|
| `id` | integer | Primary key ID of the daily log |
| `activity_id` | integer | Associated activity ID |
| `log_date` | string | Date in `YYYY-MM-DD` |
| `daily_target` | integer | Activity's daily target at time of query |
| `unit` | string / null | Activity unit |
| `notes` | string / null | Optional user notes (null if empty) |
| `actual_value` | integer / null | Raw numeric value for `count` and `duration`; `null` for `checkbox` |
| `is_completed` | boolean / null | Completion boolean for `checkbox`; `null` for `count` and `duration` |
| `target_met` | boolean | Whether target was achieved (`true`/`false`) |
| `progress_percentage` | integer | Integer 0–100 capped completion percentage |
| `created_at` | string (ISO 8601) | Timestamp created |
| `updated_at` | string (ISO 8601) | Timestamp updated |

#### B. Daily Logs Overview (`formatOverviewEntry`)
Returned by `GET /api/tracks/{track}/daily-logs?date=YYYY-MM-DD`:
Returns an array of all activities on the track. If no log exists for an activity on that date, log and progress values are `null` (with `target_met: false` and `progress_percentage: 0`).
| Field Name | Type | Description |
|---|---|---|
| `activity_id` | integer | Activity ID |
| `name` | string | Activity name |
| `description` | string / null | Activity description |
| `tracking_type` | string | `count`, `duration`, or `checkbox` |
| `daily_target` | integer | Daily target |
| `unit` | string / null | Unit |
| `is_required` | boolean | Required flag |
| `log_id` | integer / null | Daily log ID if logged; `null` otherwise |
| `log_date` | string / null | Log date if logged; `null` otherwise |
| `actual_value` | integer / null | Actual logged value (`null` if no log or checkbox) |
| `is_completed` | boolean / null | Checkbox status (`null` if no log or non-checkbox) |
| `target_met` | boolean | Whether daily target was met |
| `progress_percentage` | integer | 0–100 integer progress percentage |

---

### 5.2 Daily Logs Overview
- **Method**: `GET`
- **URL**: `/api/tracks/{track}/daily-logs`
- **Authentication**: Bearer Token
- **Query Parameters**:
  | Parameter | Type | Rules | Description |
  |---|---|---|---|
  | `date` | string | `required`, `YYYY-MM-DD` | Target date to inspect |
- **Success Status**: `200 OK`
- **Example Response**:
```json
[
  {
    "activity_id": 2,
    "name": "Pushups",
    "description": "Daily pushup reps",
    "tracking_type": "count",
    "daily_target": 50,
    "unit": "reps",
    "is_required": true,
    "log_id": 6,
    "log_date": "2026-06-15",
    "actual_value": 50,
    "is_completed": null,
    "target_met": true,
    "progress_percentage": 100
  },
  {
    "activity_id": 3,
    "name": "Meditation",
    "description": "Morning mindfulness practice",
    "tracking_type": "duration",
    "daily_target": 15,
    "unit": "minutes",
    "is_required": false,
    "log_id": null,
    "log_date": null,
    "actual_value": null,
    "is_completed": null,
    "target_met": false,
    "progress_percentage": 0
  },
  {
    "activity_id": 4,
    "name": "No Sugar",
    "description": "Avoid processed sugar all day",
    "tracking_type": "checkbox",
    "daily_target": 1,
    "unit": null,
    "is_required": true,
    "log_id": null,
    "log_date": null,
    "actual_value": null,
    "is_completed": null,
    "target_met": false,
    "progress_percentage": 0
  }
]
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Track belongs to another user.
  - `422 Unprocessable Content`: Missing or invalid `date` query parameter.

---

### 5.3 Activity Log History
- **Method**: `GET`
- **URL**: `/api/tracks/{track}/activities/{activity}/logs`
- **Authentication**: Bearer Token
- **Query Parameters**:
  | Parameter | Type | Rules | Description |
  |---|---|---|---|
  | `from` | string | `required`, `date`, `YYYY-MM-DD` | Range start date |
  | `to` | string | `required`, `date`, `YYYY-MM-DD`, `>= from` | Range end date |
- **Success Status**: `200 OK`
- **Example Response**:
```json
[
  {
    "id": 1,
    "activity_id": 2,
    "log_date": "2026-06-10",
    "daily_target": 50,
    "unit": "reps",
    "notes": null,
    "actual_value": 50,
    "is_completed": null,
    "target_met": true,
    "progress_percentage": 100,
    "created_at": "2026-06-15T12:00:00.000000Z",
    "updated_at": "2026-06-15T12:00:00.000000Z"
  },
  {
    "id": 4,
    "activity_id": 2,
    "log_date": "2026-06-11",
    "daily_target": 50,
    "unit": "reps",
    "notes": null,
    "actual_value": 25,
    "is_completed": null,
    "target_met": false,
    "progress_percentage": 50,
    "created_at": "2026-06-15T12:00:00.000000Z",
    "updated_at": "2026-06-15T12:00:00.000000Z"
  },
  {
    "id": 6,
    "activity_id": 2,
    "log_date": "2026-06-15",
    "daily_target": 50,
    "unit": "reps",
    "notes": "Completed all reps in 3 sets",
    "actual_value": 50,
    "is_completed": null,
    "target_met": true,
    "progress_percentage": 100,
    "created_at": "2026-06-15T12:00:00.000000Z",
    "updated_at": "2026-06-15T12:00:00.000000Z"
  }
]
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Unauthorized user.
  - `422 Unprocessable Content`: Missing or invalid `from`/`to` parameters.

---

### 5.4 Upsert Daily Log
- **Method**: `PUT`
- **URL**: `/api/tracks/{track}/activities/{activity}/logs/{date}`
- **Authentication**: Bearer Token
- **URL Parameters**:
  - `date`: Date string in `YYYY-MM-DD` format. Must fall between track `start_date` and `min(today, end_date)`.
- **Request Body**:
  | Field | Type | Rules | Description |
  |---|---|---|---|
  | `value` | integer | `sometimes`, `integer`, `min:0` | Required for `count` and `duration` |
  | `is_completed` | boolean | `sometimes`, `boolean` | Required for `checkbox` |
  | `notes` | string | `sometimes`, `nullable`, `string` | Optional journal notes |
- **Success Status**: `201 Created` (if inserted), `200 OK` (if updated).
- **Example Response**:
```json
{
  "id": 6,
  "activity_id": 2,
  "log_date": "2026-06-15",
  "daily_target": 50,
  "unit": "reps",
  "notes": "Completed all reps in 3 sets",
  "actual_value": 50,
  "is_completed": null,
  "target_met": true,
  "progress_percentage": 100,
  "created_at": "2026-06-15T12:00:00.000000Z",
  "updated_at": "2026-06-15T12:00:00.000000Z"
}
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Unauthorized user.
  - `404 Not Found`: Track or activity not found, or activity does not belong to track.
  - `422 Unprocessable Content`: Invalid date format, negative value, or date outside log window (`log_date_out_of_range`).

---

### 5.5 Show Daily Log
- **Method**: `GET`
- **URL**: `/api/tracks/{track}/activities/{activity}/logs/{date}`
- **Authentication**: Bearer Token
- **Success Status**: `200 OK`
- **Example Response**:
```json
{
  "id": 6,
  "activity_id": 2,
  "log_date": "2026-06-15",
  "daily_target": 50,
  "unit": "reps",
  "notes": "Completed all reps in 3 sets",
  "actual_value": 50,
  "is_completed": null,
  "target_met": true,
  "progress_percentage": 100,
  "created_at": "2026-06-15T12:00:00.000000Z",
  "updated_at": "2026-06-15T12:00:00.000000Z"
}
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Unauthorized user.
  - `404 Not Found`: No log recorded for this activity and date.

---

### 5.6 Delete Daily Log
- **Method**: `DELETE`
- **URL**: `/api/tracks/{track}/activities/{activity}/logs/{date}`
- **Authentication**: Bearer Token
- **Success Status**: `204 No Content`
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Unauthorized user.
  - `404 Not Found`: No log recorded on that date.

---

## 6. Track Progress, Calendar & Analytics Endpoints

### 6.1 Show Track Progress Summary
- **Method**: `GET`
- **URL**: `/api/tracks/{track}/progress`
- **Authentication**: Bearer Token
- **Success Status**: `200 OK`
- **Example Response**:
```json
{
  "track_id": 2,
  "status": "active",
  "total_days": 30,
  "elapsed_days": 6,
  "days_remaining": 24,
  "completed_days": 0,
  "overall_percentage": 19.5,
  "challenge_progress": 3.9,
  "milestones": [
    {
      "threshold": 25,
      "reached": false,
      "reached_on": null
    },
    {
      "threshold": 50,
      "reached": false,
      "reached_on": null
    },
    {
      "threshold": 75,
      "reached": false,
      "reached_on": null
    },
    {
      "threshold": 100,
      "reached": false,
      "reached_on": null
    }
  ],
  "schedule_percentage": 0,
  "today": {
    "date": "2026-06-15",
    "day_status": "partial",
    "completion_percentage": 33.3,
    "activities": [
      {
        "activity_id": 2,
        "name": "Pushups",
        "tracking_type": "count",
        "unit": "reps",
        "daily_target": 50,
        "is_required": true,
        "actual": 50,
        "target": 50,
        "percentage": 100,
        "is_completed": true
      },
      {
        "activity_id": 3,
        "name": "Meditation",
        "tracking_type": "duration",
        "unit": "minutes",
        "daily_target": 15,
        "is_required": false,
        "actual": 0,
        "target": 15,
        "percentage": 0,
        "is_completed": false
      },
      {
        "activity_id": 4,
        "name": "No Sugar",
        "tracking_type": "checkbox",
        "unit": null,
        "daily_target": 1,
        "is_required": true,
        "actual": 0,
        "target": 1,
        "percentage": 0,
        "is_completed": false
      }
    ]
  },
  "activities_summary": [
    {
      "activity_id": 2,
      "name": "Pushups",
      "tracking_type": "count",
      "unit": "reps",
      "daily_target": 50,
      "is_required": true,
      "days_completed": 2,
      "total_logged": 125,
      "average_daily_percentage": 41.7
    },
    {
      "activity_id": 3,
      "name": "Meditation",
      "tracking_type": "duration",
      "unit": "minutes",
      "daily_target": 15,
      "is_required": false,
      "days_completed": 1,
      "total_logged": 15,
      "average_daily_percentage": 16.7
    },
    {
      "activity_id": 4,
      "name": "No Sugar",
      "tracking_type": "checkbox",
      "unit": null,
      "daily_target": 1,
      "is_required": true,
      "days_completed": 1,
      "total_logged": 1,
      "average_daily_percentage": 16.7
    }
  ]
}
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Unauthorized user.
  - `404 Not Found`: Track does not exist.

---

### 6.2 Track Calendar
- **Method**: `GET`
- **URL**: `/api/tracks/{track}/calendar`
- **Authentication**: Bearer Token
- **Success Status**: `200 OK`
- **Example Response**:
```json
{
  "track": {
    "id": 2,
    "name": "Fitness Challenge",
    "start_date": "2026-06-10",
    "end_date": "2026-07-09",
    "status": "active",
    "total_days": 30,
    "today": "2026-06-15"
  },
  "days": [
    {
      "day_number": 1,
      "date": "2026-06-10",
      "day_status": "partial",
      "completion_percentage": 66.7,
      "activities": [
        {
          "activity_id": 2,
          "name": "Pushups",
          "tracking_type": "count",
          "unit": "reps",
          "target": 50,
          "percentage": 100,
          "value": 50
        },
        {
          "activity_id": 3,
          "name": "Meditation",
          "tracking_type": "duration",
          "unit": "minutes",
          "target": 15,
          "percentage": 100,
          "value": 15
        },
        {
          "activity_id": 4,
          "name": "No Sugar",
          "tracking_type": "checkbox",
          "unit": null,
          "target": 1,
          "percentage": 100,
          "is_completed": true
        }
      ]
    },
    {
      "day_number": 2,
      "date": "2026-06-11",
      "day_status": "partial",
      "completion_percentage": 16.7,
      "activities": [
        {
          "activity_id": 2,
          "name": "Pushups",
          "tracking_type": "count",
          "unit": "reps",
          "target": 50,
          "percentage": 50,
          "value": 25
        },
        {
          "activity_id": 3,
          "name": "Meditation",
          "tracking_type": "duration",
          "unit": "minutes",
          "target": 15,
          "percentage": 0,
          "value": 0
        },
        {
          "activity_id": 4,
          "name": "No Sugar",
          "tracking_type": "checkbox",
          "unit": null,
          "target": 1,
          "percentage": 0,
          "is_completed": false
        }
      ]
    },
    {
      "day_number": 6,
      "date": "2026-06-15",
      "day_status": "partial",
      "completion_percentage": 33.3,
      "activities": [
        {
          "activity_id": 2,
          "name": "Pushups",
          "tracking_type": "count",
          "unit": "reps",
          "target": 50,
          "percentage": 100,
          "value": 50
        },
        {
          "activity_id": 3,
          "name": "Meditation",
          "tracking_type": "duration",
          "unit": "minutes",
          "target": 15,
          "percentage": 0,
          "value": 0
        },
        {
          "activity_id": 4,
          "name": "No Sugar",
          "tracking_type": "checkbox",
          "unit": null,
          "target": 1,
          "percentage": 0,
          "is_completed": false
        }
      ]
    },
    {
      "day_number": 7,
      "date": "2026-06-16",
      "day_status": "upcoming",
      "completion_percentage": 0,
      "activities": []
    }
  ]
}
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Unauthorized user.

---

### 6.3 Track Analytics
- **Method**: `GET`
- **URL**: `/api/tracks/{track}/analytics`
- **Authentication**: Bearer Token
- **Exact Field Specification for `activities_performance` items**:
  Each entry in `activities_performance` contains the exact fields:
  | Field Name | Type | Description |
  |---|---|---|
  | `activity_id` | integer | Activity identifier |
  | `name` | string | Activity name |
  | `tracking_type` | string | Tracking type (`count`, `duration`, or `checkbox`) |
  | `unit` | string / null | Unit of measurement |
  | `daily_target` | integer | Daily target value |
  | `is_required` | boolean | Whether this activity is required |
  | `days_completed` | integer | Number of elapsed days where target was met |
  | `total_logged` | integer | Cumulative logged value across elapsed days (`count`/`duration` total sum, or count of checked days for `checkbox`) |
  | `average_daily_percentage` | float | Average daily percentage across all elapsed days (rounded to 1 decimal place) |

- **Success Status**: `200 OK`
- **Example Response**:
```json
{
  "track_id": 2,
  "status": "active",
  "overall_completion": 19.5,
  "weekly_breakdown": [
    {
      "week": 1,
      "percentage": 19.5
    }
  ],
  "activities_performance": [
    {
      "activity_id": 2,
      "name": "Pushups",
      "tracking_type": "count",
      "unit": "reps",
      "daily_target": 50,
      "is_required": true,
      "days_completed": 2,
      "total_logged": 125,
      "average_daily_percentage": 41.7
    },
    {
      "activity_id": 3,
      "name": "Meditation",
      "tracking_type": "duration",
      "unit": "minutes",
      "daily_target": 15,
      "is_required": false,
      "days_completed": 1,
      "total_logged": 15,
      "average_daily_percentage": 16.7
    },
    {
      "activity_id": 4,
      "name": "No Sugar",
      "tracking_type": "checkbox",
      "unit": null,
      "daily_target": 1,
      "is_required": true,
      "days_completed": 1,
      "total_logged": 1,
      "average_daily_percentage": 16.7
    }
  ],
  "trend": "insufficient_data"
}
```
- **Error Codes**:
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Unauthorized user.
  - `404 Not Found`: Track does not exist.
