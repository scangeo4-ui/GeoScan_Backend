

-- Init DB schema for geo-scan backend
-- Table to store vibration sensor readings
CREATE TABLE IF NOT EXISTS vibrations (
	id INT AUTO_INCREMENT PRIMARY KEY,
	device_id VARCHAR(100) NOT NULL,
	value DOUBLE NOT NULL,
	ts DATETIME DEFAULT CURRENT_TIMESTAMP,
	INDEX (device_id),
	INDEX (ts)
);

-- Table to store magnetometer sensor readings
CREATE TABLE IF NOT EXISTS magnetometers (
	id INT AUTO_INCREMENT PRIMARY KEY,
	device_id VARCHAR(100) NOT NULL,
	value DOUBLE NOT NULL,
	ts DATETIME DEFAULT CURRENT_TIMESTAMP,
	INDEX (device_id),
	INDEX (ts)
);