// routes/reservations.js
const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireAdmin, requireIntern } = require('../middleware/auth');
const { validateReservation, validateReservationRules } = require('../middleware/validation');

const router = express.Router();

// Get all reservations (Admin) or user's reservations (Intern)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { date, status, intern_id } = req.query;
        let query = `
            SELECT rd.reservation_id, rd.reservation_date, rd.time_slot, rd.reservation_status,
                   rd.reserved_at, rd.intern_id, rd.intern_name, rd.intern_email,
                   rd.seat_id, rd.seat_number, rd.location_area
            FROM reservation_details rd
        `;
        
        const params = [];
        const conditions = [];
        
        // If user is intern, only show their reservations
        if (req.user.role === 'intern') {
            conditions.push(`rd.intern_id = $${params.length + 1}`);
            params.push(req.user.id);
        } else if (req.user.role === 'admin' && intern_id) {
            // Admin can filter by specific intern
            conditions.push(`rd.intern_id = $${params.length + 1}`);
            params.push(intern_id);
        }
        
        if (date) {
            conditions.push(`rd.reservation_date = $${params.length + 1}`);
            params.push(date);
        }
        
        if (status && ['Active', 'Cancelled'].includes(status)) {
            conditions.push(`rd.reservation_status = $${params.length + 1}`);
            params.push(status);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY rd.reservation_date DESC, rd.reserved_at DESC';
        
        const result = await db.query(query, params);
        
        res.json({
            message: 'Reservations retrieved successfully',
            reservations: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching reservations:', error);
        res.status(500).json({
            message: 'Error fetching reservations',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
        });
    }
});

// Get single reservation by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        let query = `
            SELECT rd.reservation_id, rd.reservation_date, rd.time_slot, rd.reservation_status,
                   rd.reserved_at, rd.intern_id, rd.intern_name, rd.intern_email,
                   rd.seat_id, rd.seat_number, rd.location_area
            FROM reservation_details rd
            WHERE rd.reservation_id = $1
        `;
        
        const params = [id];
        
        // If user is intern, only show their reservation
        if (req.user.role === 'intern') {
            query += ' AND rd.intern_id = $2';
            params.push(req.user.id);
        }
        
        const result = await db.query(query, params);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Reservation not found' });
        }
        
        res.json({
            message: 'Reservation retrieved successfully',
            reservation: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching reservation:', error);
        res.status(500).json({
            message: 'Error fetching reservation',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
        });
    }
});

// Create new reservation (Intern only)
router.post('/', authenticateToken, requireIntern, validateReservation, validateReservationRules, async (req, res) => {
    try {
        const { seat_id, reservation_date, time_slot } = req.body;
        const intern_id = req.user.id;
        
        const result = await db.query(
            'INSERT INTO reservations (intern_id, seat_id, reservation_date, time_slot, status) VALUES ($1, $2, $3, $4, $5) RETURNING reservation_id, intern_id, seat_id, reservation_date, time_slot, status, created_at',
            [intern_id, seat_id, reservation_date, time_slot, 'Active']
        );
        
        // Get complete reservation details
        const reservationDetails = await db.query(
            `SELECT rd.reservation_id, rd.reservation_date, rd.time_slot, rd.reservation_status,
                    rd.reserved_at, rd.intern_id, rd.intern_name, rd.intern_email,
                    rd.seat_id, rd.seat_number, rd.location_area
             FROM reservation_details rd
             WHERE rd.reservation_id = $1`,
            [result.rows[0].reservation_id]
        );
        
        res.status(201).json({
            message: 'Reservation created successfully',
            reservation: reservationDetails.rows[0]
        });
    } catch (error) {
        console.error('Error creating reservation:', error);
        res.status(500).json({
            message: 'Error creating reservation',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
        });
    }
});

// Update reservation (Modify future reservations only)
router.put('/:id', authenticateToken, requireIntern, validateReservation, async (req, res) => {
    try {
        const { id } = req.params;
        const { seat_id, reservation_date, time_slot } = req.body;
        const intern_id = req.user.id;
        
        // Check if reservation exists and belongs to the intern
        const existingReservation = await db.query(
            'SELECT reservation_id, reservation_date, status FROM reservations WHERE reservation_id = $1 AND intern_id = $2',
            [id, intern_id]
        );
        
        if (existingReservation.rows.length === 0) {
            return res.status(404).json({ message: 'Reservation not found' });
        }
        
        const reservation = existingReservation.rows[0];
        
        // Check if reservation is for future date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const reservationDate = new Date(reservation.reservation_date);
        reservationDate.setHours(0, 0, 0, 0);
        
        if (reservationDate < today) {
            return res.status(400).json({ message: 'Cannot modify past reservations' });
        }
        
        if (reservation.status === 'Cancelled') {
            return res.status(400).json({ message: 'Cannot modify cancelled reservations' });
        }
        
        // Additional validation for new seat and date
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            
            // Check if intern already has a reservation for the new date (if different)
            if (reservation_date !== reservation.reservation_date) {
                const existingNewDateReservation = await client.query(
                    'SELECT reservation_id FROM reservations WHERE intern_id = $1 AND reservation_date = $2 AND status = $3 AND reservation_id != $4',
                    [intern_id, reservation_date, 'Active', id]
                );
                
                if (existingNewDateReservation.rows.length > 0) {
                    throw new Error('You can only reserve one seat per day');
                }
            }
            
            // Check if new seat is available for the new date and time slot
            const seatAvailability = await client.query(
                'SELECT reservation_id FROM reservations WHERE seat_id = $1 AND reservation_date = $2 AND time_slot = $3 AND status = $4 AND reservation_id != $5',
                [seat_id, reservation_date, time_slot, 'Active', id]
            );
            
            if (seatAvailability.rows.length > 0) {
                throw new Error('This seat is already reserved for the selected date and time slot');
            }
            
            // Update reservation
            const result = await client.query(
                'UPDATE reservations SET seat_id = $1, reservation_date = $2, time_slot = $3, updated_at = CURRENT_TIMESTAMP WHERE reservation_id = $4 RETURNING reservation_id',
                [seat_id, reservation_date, time_slot, id]
            );
            
            // Get complete updated reservation details
            const updatedReservation = await client.query(
                `SELECT rd.reservation_id, rd.reservation_date, rd.time_slot, rd.reservation_status,
                        rd.reserved_at, rd.intern_id, rd.intern_name, rd.intern_email,
                        rd.seat_id, rd.seat_number, rd.location_area
                 FROM reservation_details rd
                 WHERE rd.reservation_id = $1`,
                [id]
            );
            
            await client.query('COMMIT');
            
            res.json({
                message: 'Reservation updated successfully',
                reservation: updatedReservation.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error updating reservation:', error);
        res.status(500).json({
            message: 'Error updating reservation',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
        });
    }
});

// Cancel reservation
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        let query, params;
        
        if (req.user.role === 'intern') {
            // Intern can only cancel their own future reservations
            query = `
                UPDATE reservations 
                SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP 
                WHERE reservation_id = $1 AND intern_id = $2 AND reservation_date >= CURRENT_DATE AND status = 'Active'
                RETURNING reservation_id, reservation_date
            `;
            params = [id, req.user.id];
        } else {
            // Admin can cancel any reservation
            query = `
                UPDATE reservations 
                SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP 
                WHERE reservation_id = $1 AND status = 'Active'
                RETURNING reservation_id, reservation_date
            `;
            params = [id];
        }
        
        const result = await db.query(query, params);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                message: req.user.role === 'intern' 
                    ? 'Reservation not found or cannot be cancelled (past date or already cancelled)' 
                    : 'Reservation not found or already cancelled'
            });
        }
        
        res.json({
            message: 'Reservation cancelled successfully',
            reservation_id: result.rows[0].reservation_id,
            reservation_date: result.rows[0].reservation_date
        });
    } catch (error) {
        console.error('Error cancelling reservation:', error);
        res.status(500).json({
            message: 'Error cancelling reservation',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
        });
    }
});

// Admin: Manually assign seat to intern
router.post('/assign', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { intern_id, seat_id, reservation_date, time_slot } = req.body;
        
        // Validate inputs
        if (!intern_id || !seat_id || !reservation_date || !time_slot) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        
        // Check if intern exists
        const internExists = await db.query(
            'SELECT id, name, email FROM users WHERE id = $1 AND role = $2',
            [intern_id, 'intern']
        );
        
        if (internExists.rows.length === 0) {
            return res.status(404).json({ message: 'Intern not found' });
        }
        
        // Check if seat exists and is available
        const seatExists = await db.query(
            'SELECT seat_id, seat_number, status FROM seats WHERE seat_id = $1',
            [seat_id]
        );
        
        if (seatExists.rows.length === 0) {
            return res.status(404).json({ message: 'Seat not found' });
        }
        
        if (seatExists.rows[0].status === 'Unavailable') {
            return res.status(400).json({ message: 'Seat is not available' });
        }
        
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            
            // Check business rules
            const existingInternReservation = await client.query(
                'SELECT reservation_id FROM reservations WHERE intern_id = $1 AND reservation_date = $2 AND status = $3',
                [intern_id, reservation_date, 'Active']
            );
            
            if (existingInternReservation.rows.length > 0) {
                throw new Error('Intern already has a reservation for this date');
            }
            
            const existingSeatReservation = await client.query(
                'SELECT reservation_id FROM reservations WHERE seat_id = $1 AND reservation_date = $2 AND time_slot = $3 AND status = $4',
                [seat_id, reservation_date, time_slot, 'Active']
            );
            
            if (existingSeatReservation.rows.length > 0) {
                throw new Error('Seat is already reserved for this date and time slot');
            }
            
            // Create reservation
            const result = await client.query(
                'INSERT INTO reservations (intern_id, seat_id, reservation_date, time_slot, status) VALUES ($1, $2, $3, $4, $5) RETURNING reservation_id',
                [intern_id, seat_id, reservation_date, time_slot, 'Active']
            );
            
            // Get complete reservation details
            const reservationDetails = await client.query(
                `SELECT rd.reservation_id, rd.reservation_date, rd.time_slot, rd.reservation_status,
                        rd.reserved_at, rd.intern_id, rd.intern_name, rd.intern_email,
                        rd.seat_id, rd.seat_number, rd.location_area
                 FROM reservation_details rd
                 WHERE rd.reservation_id = $1`,
                [result.rows[0].reservation_id]
            );
            
            await client.query('COMMIT');
            
            res.status(201).json({
                message: 'Seat assigned successfully',
                reservation: reservationDetails.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error assigning seat:', error);
        res.status(500).json({
            message: 'Error assigning seat',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
        });
    }
});

module.exports = router;