// middleware/validation.js
const { body, validationResult } = require('express-validator');
const db = require('../config/database');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

// User registration validation
const validateRegistration = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
    handleValidationErrors
];

// Login validation
const validateLogin = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    body('password')
        .notEmpty()
        .withMessage('Password is required'),
    handleValidationErrors
];

// Seat creation/update validation
const validateSeat = [
    body('seat_number')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Seat number must be between 1 and 50 characters'),
    body('location_area')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Location area must be between 1 and 100 characters'),
    body('status')
        .optional()
        .isIn(['Available', 'Unavailable'])
        .withMessage('Status must be either Available or Unavailable'),
    handleValidationErrors
];

// Reservation validation
const validateReservation = [
    body('seat_id')
        .isInt({ min: 1 })
        .withMessage('Valid seat ID is required'),
    body('reservation_date')
        .isISO8601()
        .toDate()
        .custom((value) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const reservationDate = new Date(value);
            reservationDate.setHours(0, 0, 0, 0);
            
            if (reservationDate < today) {
                throw new Error('Cannot reserve seats for past dates');
            }
            
            // Check if reservation is at least 1 hour in advance for today
            if (reservationDate.getTime() === today.getTime()) {
                const now = new Date();
                const oneHourFromNow = new Date(now.getTime() + (60 * 60 * 1000));
                const currentTime = now.getHours() * 60 + now.getMinutes();
                
                // This is a simplified check - you might want to implement more sophisticated time slot validation
                if (currentTime > (9 * 60)) { // If it's after 9 AM and trying to book for today
                    throw new Error('Seats must be reserved at least 1 hour in advance');
                }
            }
            
            return true;
        }),
    body('time_slot')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Time slot is required'),
    handleValidationErrors
];

// Custom validation for unique seat number
const checkUniqueSeatNumber = async (req, res, next) => {
    try {
        const { seat_number } = req.body;
        const seatId = req.params.id; // For updates
        
        let query = 'SELECT seat_id FROM seats WHERE seat_number = $1';
        let params = [seat_number];
        
        if (seatId) {
            query += ' AND seat_id != $2';
            params.push(seatId);
        }
        
        const result = await db.query(query, params);
        
        if (result.rows.length > 0) {
            return res.status(400).json({
                message: 'Seat number already exists'
            });
        }
        
        next();
    } catch (error) {
        res.status(500).json({
            message: 'Error checking seat number uniqueness',
            error: error.message
        });
    }
};

// Custom validation for unique email
const checkUniqueEmail = async (req, res, next) => {
    try {
        const { email } = req.body;
        
        const result = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length > 0) {
            return res.status(400).json({
                message: 'Email address already registered'
            });
        }
        
        next();
    } catch (error) {
        res.status(500).json({
            message: 'Error checking email uniqueness',
            error: error.message
        });
    }
};

// Validate reservation business rules
const validateReservationRules = async (req, res, next) => {
    try {
        const { seat_id, reservation_date, time_slot } = req.body;
        const intern_id = req.user.id;
        
        // Check if intern already has a reservation for this date
        const existingInternReservation = await db.query(
            'SELECT reservation_id FROM reservations WHERE intern_id = $1 AND reservation_date = $2 AND status = $3',
            [intern_id, reservation_date, 'Active']
        );
        
        if (existingInternReservation.rows.length > 0) {
            return res.status(400).json({
                message: 'You can only reserve one seat per day'
            });
        }
        
        // Check if seat is already reserved for this date and time slot
        const existingSeatReservation = await db.query(
            'SELECT reservation_id FROM reservations WHERE seat_id = $1 AND reservation_date = $2 AND time_slot = $3 AND status = $4',
            [seat_id, reservation_date, time_slot, 'Active']
        );
        
        if (existingSeatReservation.rows.length > 0) {
            return res.status(400).json({
                message: 'This seat is already reserved for the selected date and time slot'
            });
        }
        
        // Check if seat exists and is available
        const seatCheck = await db.query(
            'SELECT seat_id, status FROM seats WHERE seat_id = $1',
            [seat_id]
        );
        
        if (seatCheck.rows.length === 0) {
            return res.status(404).json({
                message: 'Seat not found'
            });
        }
        
        if (seatCheck.rows[0].status === 'Unavailable') {
            return res.status(400).json({
                message: 'This seat is currently unavailable'
            });
        }
        
        next();
    } catch (error) {
        res.status(500).json({
            message: 'Error validating reservation',
            error: error.message
        });
    }
};

module.exports = {
    validateRegistration,
    validateLogin,
    validateSeat,
    validateReservation,
    checkUniqueSeatNumber,
    checkUniqueEmail,
    validateReservationRules,
    handleValidationErrors
};