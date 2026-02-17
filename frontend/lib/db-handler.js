import fs from 'fs';
import path from 'path';

// Path to our new JSON database file
// This path now goes UP one level from 'frontend' to the project root.
const dbPath = path.join(process.cwd(), '..', 'db.json');

// Initial data to write if the file doesn't exist
const initialData = {
  1: {
    name: "Dr. Rakib Hasan",
    referencePhotoUrl: "/photos/dr_rakib.jpg",
    passwordHash: null,
  },
  2: {
    name: "Dr. Ashikul Islam",
    referencePhotoUrl: "/photos/dr_ashik.jpg",
    passwordHash: null,
  },
  3: {
    name: "Dr. Maliha Rahman",
    referencePhotoUrl: "/photos/dr_maliha.jpg",
    passwordHash: null,
  },
};

// Function to read the database
export function readDoctorDB() {
  try {
    // If file doesn't exist, create it with initial data
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    // If it exists, read it
    const fileData = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(fileData);
  } catch (e) {
    console.error("Failed to read DB, returning initial data", e);
    return initialData; // Fallback
  }
}

// Function to write to the database
export function writeDoctorDB(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error("Failed to write to DB", e);
  }
}