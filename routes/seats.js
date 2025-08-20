// routes/seats.js
const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validateSeat, checkUniqueSeatNumber } = require('../middleware/validation');

const router = express.Router();

// Get all seats (available to all authenticated users)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { status, location } = req.query;
        let query = 'SELECT seat_id, seat_number, location_area, status, created_at, updated_at FROM seats';
        const params = [];
        const conditions = [];
        
        if (status && ['Available', 'Unavailable'].includes(status)) {
            conditions.push(`status = $${params.length + 1}`);
            params.push(status);
        }
        
        if (location) {
            conditions.push(`location_area ILIKE $${params.length + 1}`);
            params.push(`%${location}%`);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY seat_number';
        
        const result = await db.query(query, params);
        
        res.json({
            message: 'Seats retrieved successfully',
            seats: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching seats:', error);
        res.status(500).json({
            message: 'Error fetching seats',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
        });
    }
});

// Get available seats by date
router.get('/available/:date', authenticateToken, async (req, res) => {
    try {
        const { date } = req.params;
        const { time_slot } = req.query;
        
        // Validate date format
        const reservationDate = new Date(date);
        if (isNaN(reservationDate.getTime())) {
            return res.status(400).json({ message: 'Invalid date format' });
        }
        
        let query = `
            SELECT s.seat_id, s.seat_number, s.location_area, s.status
            FROM seats s
            WHERE s.status = 'Available'
            AND s.seat_id NOT IN (
                SELECT r.seat_id 
                FROM reservations r 
                WHERE r.reservation_date = $1 
                AND r.status = 'Active'
        `;
        
        const params = [date];
        
        if (time_slot) {
            query += ' AND r.time_slot = $2';
            params.push(time_slot);
        }
        
        query += ') ORDER BY s.seat_number';
        
        const result = await db.query(query, params);
        
        res.json({
            message: 'Available seats retrieved successfully',
            date: date,
            time_slot: time_slot || 'All day',
            seats: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching available seats:', error);
        res.status(500).json({
            message: 'Error fetching available seats',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
        });
    }
});

// Get single seat by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(
            'SELECT seat_id, seat_number, location_area, status, created_at, updated_at FROM seats WHERE seat_id = $1',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Seat not found' });
        }
        
        res.json({
            message: 'Seat retrieved successfully',
            seat: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching seat:', error);
        res.status(500).json({
            message: 'Error fetching seat',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
        });
    }
});

// Admin routes for seat management
// Create new seat
router.post('/', authenticateToken, requireAdmin, validateSeat, checkUniqueSeatNumber, async (req, res) => {
    try {
        const { seat_number, location_area, status = 'Available' } = req.body;
        
        const result = await db.query(
            'INSERT INTO seats (seat_number, location_area, status) VALUES ($1, $2, $3) RETURNING seat_id, seat_number, location_area, status, created_at',
            [seat_number, location_area, status]
        );
        
        res.status(201).json({
            message: 'Seat created successfully',
            seat: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating seat:', error);
        res.status(500).json({
            message: 'Error creating seat',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
        });
    }
});

// Update seat
router.put('/:id', authenticateToken, requireAdmin, validateSeat, checkUniqueSeatNumber, async (req, res) => {
    try {
        const { id } = req.params;
        const { seat_number, location_area, status } = req.body;
        
        // Check if seat exists
        const existingSeat = await db.query(
            'SELECT seat_id FROM seats WHERE seat_id = $1',
            [id]
        );
        
        if (existingSeat.rows.length === 0) {
            return res.status(404).json({ message: 'Seat not found' });
        }
        
        const result = await db.query(
            'UPDATE seats SET seat_number = $1, location_area = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE seat_id = $4 RETURNING seat_id, seat_number, location_area, status, updated_at',
            [seat_number, location_area, status, id]
        );
        
        res.json({
            message: 'Seat updated successfully',
            seat: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating seat:', error);
        res.status(500).json({
            message: 'Error updating seat',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
        });
    }
});

// Delete seat
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if seat has active reservations
        const activeReservations = await db.query(
            'SELECT reservation_id FROM reservations WHERE seat_id = $1 AND status = $2 AND reservation_date >= CURRENT_DATE',
            [id, 'Active']
        );
        
        if (activeReservations.rows.length > 0) {
            return res.status(400).json({
                message: 'Cannot delete seat with active reservations',
                active_reservations_count: activeReservations.rows.length
            });
        }
        
        // Delete the seat
        const result = await db.query(
            'DELETE FROM seats WHERE seat_id = $1 RETURNING seat_number',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Seat not found' });
        }
        
        res.json({
            message: 'Seat deleted successfully',
            deleted_seat: result.rows[0].seat_number
        });
    } catch (error) {
        console.error('Error deleting seat:', error);
        res.status(500).json({
            message: 'Error deleting seat',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
        });
    }
});

module.exports = router;