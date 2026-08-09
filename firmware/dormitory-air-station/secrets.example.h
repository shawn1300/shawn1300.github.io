#pragma once

// Copy this file to secrets.h and replace the values locally.
// secrets.h is ignored by Git and must never be committed.
// Add or remove rows as needed. The first row has the highest priority.
constexpr WiFiCredential WIFI_NETWORKS[] = {
    {"your-primary-2.4-ghz-wifi", "your-primary-wifi-password"},
    {"your-backup-2.4-ghz-wifi", "your-backup-wifi-password"},
};

constexpr char SOURCE_TOKEN[] = "your-dormitory-esp32-source-token";
