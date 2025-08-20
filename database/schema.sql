-- Seat Reservation System Database Schema for PostgreSQL

-- Create database
-- CREATE DATABASE seat_reservation_system;

-- Users table (Interns & Admins)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'intern' CHECK (role IN ('intern', 'admin')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seats table
CREATE TABLE IF NOT EXISTS seats (
    seat_id SERIAL PRIMARY KEY,
    seat_number VARCHAR(50) UNIQUE NOT NULL,
    location_area VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'Available' CHECK (status IN ('Available', 'Unavailable')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reservations table
CREATE TABLE IF NOT EXISTS reservations (
    reservation_id SERIAL PRIMARY KEY,
    intern_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seat_id INTEGER NOT NULL REFERENCES seats(seat_id) ON DELETE CASCADE,
    reservation_date DATE NOT NULL,
    time_slot VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint: An intern can only reserve one seat per day
    UNIQUE(intern_id, reservation_date),
    
    -- Constraint: A seat can only be reserved once per date and time slot
    UNIQUE(seat_id, reservation_date, time_slot)
);

-- Create indexes only if they do not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='idx_reservations_date') THEN
        CREATE INDEX idx_reservations_date ON reservations(reservation_date);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='idx_reservations_intern') THEN
        CREATE INDEX idx_reservations_intern ON reservations(intern_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='idx_reservations_seat') THEN
        CREATE INDEX idx_reservations_seat ON reservations(seat_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='idx_users_email') THEN
        CREATE INDEX idx_users_email ON users(email);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='idx_users_role') THEN
        CREATE INDEX idx_users_role ON users(role);
    END IF;
END
$$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_seats_updated_at') THEN
        CREATE TRIGGER update_seats_updated_at BEFORE UPDATE ON seats
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_reservations_updated_at') THEN
        CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON reservations
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;

-- Insert sample seats safely (won't duplicate)
INSERT INTO seats (seat_number, location_area, status)
VALUES 
('A001', 'Floor 1 - Zone A', 'Available'),
('A002', 'Floor 1 - Zone A', 'Available'),
('A003', 'Floor 1 - Zone A', 'Available'),
('B001', 'Floor 1 - Zone B', 'Available'),
('B002', 'Floor 1 - Zone B', 'Available'),
('B003', 'Floor 1 - Zone B', 'Available'),
('C001', 'Floor 2 - Zone C', 'Available'),
('C002', 'Floor 2 - Zone C', 'Available'),
('C003', 'Floor 2 - Zone C', 'Available'),
('D001', 'Floor 2 - Zone D', 'Available')
ON CONFLICT (seat_number) DO NOTHING;

-- View for reservation details with user and seat info
CREATE OR REPLACE VIEW reservation_details AS
SELECT 
    r.reservation_id,
    r.reservation_date,
    r.time_slot,
    r.status as reservation_status,
    r.created_at as reserved_at,
    u.id as intern_id,
    u.name as intern_name,
    u.email as intern_email,
    s.seat_id,
    s.seat_number,
    s.location_area
FROM reservations r
JOIN users u ON r.intern_id = u.id
JOIN seats s ON r.seat_id = s.seat_id;