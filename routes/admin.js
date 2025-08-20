// routes/admin.js
const express = require("express");
const db = require("../config/database");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Dashboard statistics
router.get("/dashboard", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Get total counts
    const [
      totalSeats,
      totalInterns,
      todayReservations,
      activeReservations,
      availableSeats,
    ] = await Promise.all([
      db.query("SELECT COUNT(*) as count FROM seats"),
      db.query("SELECT COUNT(*) as count FROM users WHERE role = $1", [
        "intern",
      ]),
      db.query(
        "SELECT COUNT(*) as count FROM reservations WHERE reservation_date = $1 AND status = $2",
        [today, "Active"]
      ),
      db.query(
        "SELECT COUNT(*) as count FROM reservations WHERE status = $1 AND reservation_date >= $2",
        ["Active", today]
      ),
      db.query("SELECT COUNT(*) as count FROM seats WHERE status = $1", [
        "Available",
      ]),
    ]);

    // Get seat utilization for the last 7 days
    const utilizationQuery = `
            SELECT 
                reservation_date,
                COUNT(*) as reservations_count,
                (SELECT COUNT(*) FROM seats WHERE status = 'Available') as total_available_seats,
                ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM seats WHERE status = 'Available')), 2) as utilization_percentage
            FROM reservations 
            WHERE reservation_date >= CURRENT_DATE - INTERVAL '7 days' 
            AND status = 'Active'
            GROUP BY reservation_date 
            ORDER BY reservation_date DESC
        `;
    const utilizationResult = await db.query(utilizationQuery);

    // Get popular time slots
    const popularTimeSlotsQuery = `
            SELECT 
                time_slot,
                COUNT(*) as booking_count
            FROM reservations 
            WHERE reservation_date >= CURRENT_DATE - INTERVAL '30 days'
            AND status = 'Active'
            GROUP BY time_slot 
            ORDER BY booking_count DESC 
            LIMIT 5
        `;
    const popularTimeSlots = await db.query(popularTimeSlotsQuery);

    // Get popular locations
    const popularLocationsQuery = `
            SELECT 
                s.location_area,
                COUNT(*) as booking_count
            FROM reservations r
            JOIN seats s ON r.seat_id = s.seat_id
            WHERE r.reservation_date >= CURRENT_DATE - INTERVAL '30 days'
            AND r.status = 'Active'
            GROUP BY s.location_area 
            ORDER BY booking_count DESC 
            LIMIT 5
        `;
    const popularLocations = await db.query(popularLocationsQuery);

    res.json({
      message: "Dashboard data retrieved successfully",
      statistics: {
        total_seats: parseInt(totalSeats.rows[0].count),
        total_interns: parseInt(totalInterns.rows[0].count),
        today_reservations: parseInt(todayReservations.rows[0].count),
        active_reservations: parseInt(activeReservations.rows[0].count),
        available_seats: parseInt(availableSeats.rows[0].count),
      },
      seat_utilization: utilizationResult.rows,
      popular_time_slots: popularTimeSlots.rows,
      popular_locations: popularLocations.rows,
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({
      message: "Error fetching dashboard data",
      error:
        process.env.NODE_ENV === "development" ? error.message : "Server error",
    });
  }
});

// Generate seat usage reports
router.get(
  "/reports/usage",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { start_date, end_date, format = "json" } = req.query;

      // Set default date range (last 30 days)
      const endDate = end_date || new Date().toISOString().split("T")[0];
      const startDate =
        start_date ||
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

      // Detailed usage report
      const usageReportQuery = `
    SELECT 
        s.seat_number,
        s.location_area,
        COUNT(r.reservation_id) as total_bookings,
        COUNT(DISTINCT r.intern_id) as unique_users,
        MIN(r.reservation_date) as first_booking_date,
        MAX(r.reservation_date) as last_booking_date,
        ROUND(
            COUNT(r.reservation_id) * 100.0 / 
            NULLIF((CAST($2 AS DATE) - CAST($1 AS DATE) + 1), 0), 2
        ) as utilization_percentage
    FROM seats s
    LEFT JOIN reservations r ON s.seat_id = r.seat_id 
        AND r.reservation_date BETWEEN $1 AND $2 
        AND r.status = 'Active'
    GROUP BY s.seat_id, s.seat_number, s.location_area
    ORDER BY total_bookings DESC, s.seat_number
`;
      const usageReport = await db.query(usageReportQuery, [
        startDate,
        endDate,
      ]);

      // Daily summary
      const dailySummaryQuery = `
            SELECT 
                reservation_date,
                COUNT(*) as total_reservations,
                COUNT(DISTINCT seat_id) as seats_used,
                COUNT(DISTINCT intern_id) as unique_interns,
                (SELECT COUNT(*) FROM seats WHERE status = 'Available') as total_available_seats
            FROM reservations 
            WHERE reservation_date BETWEEN $1 AND $2 
            AND status = 'Active'
            GROUP BY reservation_date 
            ORDER BY reservation_date
        `;
      const dailySummary = await db.query(dailySummaryQuery, [
        startDate,
        endDate,
      ]);

      // Intern usage summary
      const internUsageQuery = `
            SELECT 
                u.name as intern_name,
                u.email as intern_email,
                COUNT(r.reservation_id) as total_reservations,
                COUNT(DISTINCT r.seat_id) as unique_seats_used,
                MIN(r.reservation_date) as first_reservation,
                MAX(r.reservation_date) as last_reservation
            FROM users u
            LEFT JOIN reservations r ON u.id = r.intern_id 
                AND r.reservation_date BETWEEN $1 AND $2 
                AND r.status = 'Active'
            WHERE u.role = 'intern'
            GROUP BY u.id, u.name, u.email
            HAVING COUNT(r.reservation_id) > 0
            ORDER BY total_reservations DESC
        `;
      const internUsage = await db.query(internUsageQuery, [
        startDate,
        endDate,
      ]);

      const reportData = {
        message: "Usage report generated successfully",
        report_period: {
          start_date: startDate,
          end_date: endDate,
          days_included:
            Math.ceil(
              (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)
            ) + 1,
        },
        seat_usage: usageReport.rows,
        daily_summary: dailySummary.rows,
        intern_usage: internUsage.rows,
        summary: {
          total_reservations: dailySummary.rows.reduce(
            (sum, day) => sum + parseInt(day.total_reservations),
            0
          ),
          average_daily_reservations:
            dailySummary.rows.length > 0
              ? Math.round(
                  dailySummary.rows.reduce(
                    (sum, day) => sum + parseInt(day.total_reservations),
                    0
                  ) / dailySummary.rows.length
                )
              : 0,
          most_used_seat:
            usageReport.rows.length > 0
              ? usageReport.rows[0].seat_number
              : null,
          most_active_intern:
            internUsage.rows.length > 0
              ? internUsage.rows[0].intern_name
              : null,
        },
      };

      if (format === "csv") {
        // Generate CSV format
        let csv = "Seat Usage Report\n";
        csv += `Period: ${startDate} to ${endDate}\n\n`;

        csv +=
          "Seat Number,Location,Total Bookings,Unique Users,Utilization %\n";
        usageReport.rows.forEach((seat) => {
          csv += `${seat.seat_number},${seat.location_area},${seat.total_bookings},${seat.unique_users},${seat.utilization_percentage}\n`;
        });

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=seat-usage-report-${startDate}-to-${endDate}.csv`
        );
        res.send(csv);
      } else {
        res.json(reportData);
      }
    } catch (error) {
      console.error("Error generating usage report:", error);
      res.status(500).json({
        message: "Error generating usage report",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Server error",
      });
    }
  }
);

// Get all interns
router.get("/interns", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { search } = req.query;

    let query = `
            SELECT 
                u.id, u.name, u.email, u.created_at,
                COUNT(r.reservation_id) as total_reservations,
                MAX(r.reservation_date) as last_reservation_date
            FROM users u
            LEFT JOIN reservations r ON u.id = r.intern_id AND r.status = 'Active'
            WHERE u.role = 'intern'
        `;

    const params = [];

    if (search) {
      query += " AND (u.name ILIKE $1 OR u.email ILIKE $1)";
      params.push(`%${search}%`);
    }

    query += ` 
            GROUP BY u.id, u.name, u.email, u.created_at
            ORDER BY u.name
        `;

    const result = await db.query(query, params);

    res.json({
      message: "Interns retrieved successfully",
      interns: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("Error fetching interns:", error);
    res.status(500).json({
      message: "Error fetching interns",
      error:
        process.env.NODE_ENV === "development" ? error.message : "Server error",
    });
  }
});

// Get reservations by date
router.get(
  "/reservations/by-date/:date",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { date } = req.params;

      const query = `
            SELECT rd.reservation_id, rd.reservation_date, rd.time_slot, rd.reservation_status,
                   rd.reserved_at, rd.intern_id, rd.intern_name, rd.intern_email,
                   rd.seat_id, rd.seat_number, rd.location_area
            FROM reservation_details rd
            WHERE rd.reservation_date = $1
            ORDER BY rd.time_slot, rd.seat_number
        `;

      const result = await db.query(query, [date]);

      res.json({
        message: "Reservations retrieved successfully",
        date: date,
        reservations: result.rows,
        count: result.rows.length,
      });
    } catch (error) {
      console.error("Error fetching reservations by date:", error);
      res.status(500).json({
        message: "Error fetching reservations by date",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Server error",
      });
    }
  }
);

// Get reservations by intern
router.get(
  "/reservations/by-intern/:intern_id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { intern_id } = req.params;
      const { status, limit = 50 } = req.query;

      let query = `
            SELECT rd.reservation_id, rd.reservation_date, rd.time_slot, rd.reservation_status,
                   rd.reserved_at, rd.intern_id, rd.intern_name, rd.intern_email,
                   rd.seat_id, rd.seat_number, rd.location_area
            FROM reservation_details rd
            WHERE rd.intern_id = $1
        `;

      const params = [intern_id];

      if (status && ["Active", "Cancelled"].includes(status)) {
        query += " AND rd.reservation_status = $2";
        params.push(status);
      }

      query += " ORDER BY rd.reservation_date DESC, rd.reserved_at DESC";

      if (limit) {
        query += ` LIMIT ${params.length + 1}`;
        params.push(parseInt(limit));
      }

      const result = await db.query(query, params);

      res.json({
        message: "Intern reservations retrieved successfully",
        intern_id: intern_id,
        reservations: result.rows,
        count: result.rows.length,
      });
    } catch (error) {
      console.error("Error fetching intern reservations:", error);
      res.status(500).json({
        message: "Error fetching intern reservations",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Server error",
      });
    }
  }
);

// Data cleanup - remove old reservation records (6 months retention)
router.post("/cleanup", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const cutoffDate = sixMonthsAgo.toISOString().split("T")[0];

    const result = await db.query(
      "DELETE FROM reservations WHERE reservation_date < $1 RETURNING reservation_id",
      [cutoffDate]
    );

    res.json({
      message: "Data cleanup completed successfully",
      deleted_records: result.rows.length,
      cutoff_date: cutoffDate,
    });
  } catch (error) {
    console.error("Error during data cleanup:", error);
    res.status(500).json({
      message: "Error during data cleanup",
      error:
        process.env.NODE_ENV === "development" ? error.message : "Server error",
    });
  }
});

module.exports = router;
