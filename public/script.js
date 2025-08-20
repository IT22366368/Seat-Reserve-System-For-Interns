// script.js
class SeatReservationApp {
  constructor() {
    this.apiBase = "/api";
    this.token = localStorage.getItem("authToken");
    this.user = null;
    this.selectedSeat = null;
    this.modalAction = null;

    this.init();
  }

  async init() {
    await this.checkAuth();
    this.setupEventListeners();
    this.setMinDate();
  }

  setupEventListeners() {
    // Set minimum date for date inputs
    const today = new Date().toISOString().split("T")[0];
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach((input) => {
      input.min = today;
    });
  }

  setMinDate() {
    const today = new Date().toISOString().split("T")[0];
    const reservationDate = document.getElementById("reservationDate");
    const reportStartDate = document.getElementById("reportStartDate");
    const reportEndDate = document.getElementById("reportEndDate");
    const reservationDateFilter = document.getElementById(
      "reservationDateFilter"
    );

    if (reservationDate) reservationDate.min = today;
    if (reportStartDate) reportStartDate.value = today;
    if (reportEndDate) reportEndDate.value = today;
  }

  // Authentication Methods
  async checkAuth() {
    if (!this.token) {
      this.showLogin();
      return;
    }

    try {
      const response = await this.apiCall("POST", "/auth/verify-token");
      if (response.valid) {
        this.user = response.user;
        this.showDashboard();
      } else {
        this.logout();
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      this.logout();
    }
  }

  async apiCall(method, endpoint, data = null) {
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (this.token) {
      options.headers["Authorization"] = `Bearer ${this.token}`;
    }

    if (data && method !== "GET") {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(this.apiBase + endpoint, options);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "API call failed");
    }

    return result;
  }

  // UI Methods
  showLogin() {
    this.hideAll();
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("loginNavItem").classList.remove("hidden");
    document.getElementById("registerNavItem").classList.remove("hidden");
  }

  showRegister() {
    this.hideAll();
    document.getElementById("registerForm").classList.remove("hidden");
    document.getElementById("loginNavItem").classList.remove("hidden");
    document.getElementById("registerNavItem").classList.remove("hidden");
  }

  showDashboard() {
    this.hideAll();
    document.getElementById("userNavItem").classList.remove("hidden");
    document.getElementById("userNameDisplay").textContent = this.user.name;

    if (this.user.role === "admin") {
      document.getElementById("adminDashboard").classList.remove("hidden");
      this.loadAdminDashboard();
    } else {
      document.getElementById("internDashboard").classList.remove("hidden");
      document.getElementById("internNameDisplay").textContent = this.user.name;
      this.loadMyReservations();
    }
  }

  hideAll() {
    const elements = [
      "loginForm",
      "registerForm",
      "internDashboard",
      "adminDashboard",
      "loginNavItem",
      "registerNavItem",
      "userNavItem",
    ];
    elements.forEach((id) => {
      document.getElementById(id).classList.add("hidden");
    });
  }

  showTab(tabName) {
    // Hide all intern tabs
    const tabs = ["bookingTab", "myReservationsTab"];
    tabs.forEach((tab) => {
      document.getElementById(tab).classList.add("hidden");
    });

    // Remove active class from all tab buttons
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.remove("active");
    });

    // Show selected tab and mark button as active
    document.getElementById(tabName + "Tab").classList.remove("hidden");
    event.target.classList.add("active");

    // Load data for specific tabs
    if (tabName === "myReservations") {
      this.loadMyReservations();
    }
  }

  showAdminTab(tabName) {
    // Hide all admin tabs
    const tabs = ["overviewTab", "seatsTab", "reservationsTab", "reportsTab"];
    tabs.forEach((tab) => {
      document.getElementById(tab).classList.add("hidden");
    });

    // Remove active class from all tab buttons
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.remove("active");
    });

    // Show selected tab and mark button as active
    document.getElementById(tabName + "Tab").classList.remove("hidden");
    event.target.classList.add("active");

    // Load data for specific tabs
    switch (tabName) {
      case "overview":
        this.loadAdminDashboard();
        break;
      case "seats":
        this.loadAllSeats();
        break;
      case "reservations":
        this.loadAllReservations();
        break;
      case "reports":
        break; // Reports are loaded on demand
    }
  }

  showSpinner() {
    document.getElementById("loadingSpinner").classList.remove("hidden");
  }

  hideSpinner() {
    document.getElementById("loadingSpinner").classList.add("hidden");
  }

  showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 5px;">
                ${type.charAt(0).toUpperCase() + type.slice(1)}
            </div>
            <div>${message}</div>
        `;

    document.getElementById("toastContainer").appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  showModal(title, body, confirmText = "Confirm", action = null) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalBody").innerHTML = body;
    document.getElementById("modalConfirmBtn").textContent = confirmText;
    this.modalAction = action;
    document.getElementById("modal").classList.remove("hidden");
  }

  hideModal() {
    document.getElementById("modal").classList.add("hidden");
    this.modalAction = null;
  }

  confirmModalAction() {
    if (this.modalAction) {
      this.modalAction();
    }
    this.hideModal();
  }

  // Auth Handlers
  async handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    try {
      this.showSpinner();
      const response = await this.apiCall("POST", "/auth/login", {
        email,
        password,
      });

      this.token = response.token;
      this.user = response.user;
      localStorage.setItem("authToken", this.token);

      this.showToast("Login successful!", "success");
      this.showDashboard();
    } catch (error) {
      this.showToast(error.message, "error");
    } finally {
      this.hideSpinner();
    }
  }

  async handleRegister(event) {
    event.preventDefault();

    const name = document.getElementById("registerName").value;
    const email = document.getElementById("registerEmail").value;
    const password = document.getElementById("registerPassword").value;

    // Basic password validation
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      this.showToast(
        "Password must contain at least one uppercase letter, one lowercase letter, and one number",
        "error"
      );
      return;
    }

    try {
      this.showSpinner();
      const response = await this.apiCall("POST", "/auth/register", {
        name,
        email,
        password,
      });

      this.token = response.token;
      this.user = response.user;
      localStorage.setItem("authToken", this.token);

      this.showToast("Registration successful!", "success");
      this.showDashboard();
    } catch (error) {
      this.showToast(error.message, "error");
    } finally {
      this.hideSpinner();
    }
  }

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem("authToken");
    this.showLogin();
    this.showToast("You have been logged out", "info");
  }

  // Booking Methods
  async searchAvailableSeats() {
    const date = document.getElementById("reservationDate").value;
    const timeSlot = document.getElementById("timeSlot").value;

    if (!date || !timeSlot) {
      this.showToast("Please select both date and time slot", "warning");
      return;
    }

    try {
      this.showSpinner();
      const response = await this.apiCall(
        "GET",
        `/seats/available/${date}?time_slot=${encodeURIComponent(timeSlot)}`
      );

      this.displayAvailableSeats(response.seats);
      document
        .getElementById("availableSeatsSection")
        .classList.remove("hidden");
    } catch (error) {
      this.showToast(error.message, "error");
    } finally {
      this.hideSpinner();
    }
  }

  displayAvailableSeats(seats) {
    const grid = document.getElementById("availableSeatsGrid");

    if (seats.length === 0) {
      grid.innerHTML =
        '<p class="text-center">No seats available for the selected date and time slot.</p>';
      return;
    }

    grid.innerHTML = seats
      .map(
        (seat) => `
            <div class="seat-card available" onclick="app.selectSeat(${seat.seat_id})">
                <div class="seat-number">${seat.seat_number}</div>
                <div class="seat-location">${seat.location_area}</div>
            </div>
        `
      )
      .join("");
  }

  selectSeat(seatId) {
    // Remove previous selection
    document.querySelectorAll(".seat-card").forEach((card) => {
      card.classList.remove("selected");
    });

    // Mark selected seat
    const seatCard = event.target.closest(".seat-card");
    seatCard.classList.add("selected");

    this.selectedSeat = seatId;
    const seatNumber = seatCard.querySelector(".seat-number").textContent;
    const seatLocation = seatCard.querySelector(".seat-location").textContent;

    document.getElementById(
      "selectedSeatDisplay"
    ).textContent = `${seatNumber} (${seatLocation})`;
    document.getElementById("selectedSeatInfo").classList.remove("hidden");
  }

  async confirmBooking() {
    if (!this.selectedSeat) {
      this.showToast("Please select a seat first", "warning");
      return;
    }

    const date = document.getElementById("reservationDate").value;
    const timeSlot = document.getElementById("timeSlot").value;

    try {
      this.showSpinner();
      const response = await this.apiCall("POST", "/reservations", {
        seat_id: this.selectedSeat,
        reservation_date: date,
        time_slot: timeSlot,
      });

      this.showToast("Seat reserved successfully!", "success");

      // Reset form
      document.getElementById("availableSeatsSection").classList.add("hidden");
      document.getElementById("selectedSeatInfo").classList.add("hidden");
      document.querySelector("form").reset();
      this.selectedSeat = null;
      this.setMinDate();
    } catch (error) {
      this.showToast(error.message, "error");
    } finally {
      this.hideSpinner();
    }
  }

  // Reservation Management
  async loadMyReservations() {
    try {
      const status =
        document.getElementById("reservationStatusFilter")?.value || "";
      let url = "/reservations";
      if (status) {
        url += `?status=${status}`;
      }

      const response = await this.apiCall("GET", url);
      this.displayReservations(
        response.reservations,
        "myReservationsGrid",
        true
      );
    } catch (error) {
      this.showToast(error.message, "error");
    }
  }

  displayReservations(reservations, containerId, showActions = false) {
    const container = document.getElementById(containerId);

    if (reservations.length === 0) {
      container.innerHTML = '<p class="text-center">No reservations found.</p>';
      return;
    }

    container.innerHTML = reservations
      .map((reservation) => {
        const canModify =
          showActions &&
          reservation.reservation_status === "Active" &&
          new Date(reservation.reservation_date) >= new Date();

        return `
                <div class="reservation-card">
                    <div class="reservation-header">
                        <h5>Seat ${reservation.seat_number}</h5>
                        <span class="reservation-status ${reservation.reservation_status.toLowerCase()}">
                            ${reservation.reservation_status}
                        </span>
                    </div>
                    <div class="reservation-details">
                        <div class="reservation-detail">
                            <div class="reservation-detail-label">Date</div>
                            <div class="reservation-detail-value">${new Date(
                              reservation.reservation_date
                            ).toLocaleDateString()}</div>
                        </div>
                        <div class="reservation-detail">
                            <div class="reservation-detail-label">Time Slot</div>
                            <div class="reservation-detail-value">${
                              reservation.time_slot
                            }</div>
                        </div>
                        <div class="reservation-detail">
                            <div class="reservation-detail-label">Location</div>
                            <div class="reservation-detail-value">${
                              reservation.location_area
                            }</div>
                        </div>
                        <div class="reservation-detail">
                            <div class="reservation-detail-label">Reserved On</div>
                            <div class="reservation-detail-value">${new Date(
                              reservation.reserved_at
                            ).toLocaleString()}</div>
                        </div>
                        ${
                          !showActions
                            ? `
                        <div class="reservation-detail">
                            <div class="reservation-detail-label">Intern</div>
                            <div class="reservation-detail-value">${reservation.intern_name}</div>
                        </div>
                        `
                            : ""
                        }
                    </div>
                    ${
                      canModify
                        ? `
                    <div class="form-actions mt-2">
                        <button class="btn btn-warning btn-sm" onclick="app.showModifyReservation(${reservation.reservation_id})">
                            Modify
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="app.cancelReservation(${reservation.reservation_id})">
                            Cancel
                        </button>
                    </div>
                    `
                        : ""
                    }
                </div>
            `;
      })
      .join("");
  }

  async cancelReservation(reservationId) {
    this.showModal(
      "Cancel Reservation",
      "Are you sure you want to cancel this reservation?",
      "Cancel Reservation",
      async () => {
        try {
          this.showSpinner();
          await this.apiCall("DELETE", `/reservations/${reservationId}`);
          this.showToast("Reservation cancelled successfully", "success");

          // Reload appropriate data
          if (this.user.role === "admin") {
            this.loadAllReservations();
          } else {
            this.loadMyReservations();
          }
        } catch (error) {
          this.showToast(error.message, "error");
        } finally {
          this.hideSpinner();
        }
      }
    );
  }

  // Admin Methods
  async loadAdminDashboard() {
    try {
      const response = await this.apiCall("GET", "/admin/dashboard");

      document.getElementById("totalSeatsCount").textContent =
        response.statistics.total_seats;
      document.getElementById("totalInternsCount").textContent =
        response.statistics.total_interns;
      document.getElementById("todayReservationsCount").textContent =
        response.statistics.today_reservations;
      document.getElementById("activeReservationsCount").textContent =
        response.statistics.active_reservations;
    } catch (error) {
      this.showToast(error.message, "error");
    }
  }

  async loadAllSeats() {
    try {
      const response = await this.apiCall("GET", "/seats");
      this.displayAllSeats(response.seats);
    } catch (error) {
      this.showToast(error.message, "error");
    }
  }

  displayAllSeats(seats) {
    const grid = document.getElementById("seatsGrid");

    grid.innerHTML = seats
      .map(
        (seat) => `
            <div class="admin-card">
                <div class="admin-card-header">
                    <h5>Seat ${seat.seat_number}</h5>
                    <span class="reservation-status ${seat.status.toLowerCase()}">
                        ${seat.status}
                    </span>
                </div>
                <div class="reservation-details">
                    <div class="reservation-detail">
                        <div class="reservation-detail-label">Location</div>
                        <div class="reservation-detail-value">${
                          seat.location_area
                        }</div>
                    </div>
                    <div class="reservation-detail">
                        <div class="reservation-detail-label">Created</div>
                        <div class="reservation-detail-value">${new Date(
                          seat.created_at
                        ).toLocaleDateString()}</div>
                    </div>
                </div>
                <div class="form-actions mt-2">
                    <button class="btn btn-warning btn-sm" onclick="app.showEditSeat(${
                      seat.seat_id
                    })">
                        Edit
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="app.deleteSeat(${
                      seat.seat_id
                    })">
                        Delete
                    </button>
                </div>
            </div>
        `
      )
      .join("");
  }

  showAddSeatForm() {
    document.getElementById("addSeatFormTitle").textContent = "Add New Seat";
    document.getElementById("addSeatSubmitBtn").textContent = "Add Seat";
    document.getElementById("addSeatForm").classList.remove("hidden");
    document.getElementById("seatNumber").value = "";
    document.getElementById("locationArea").value = "";
    document.getElementById("seatStatus").value = "Available";
  }

  hideAddSeatForm() {
    const form = document.getElementById("addSeatForm");
    form.classList.add("hidden");
    this.editingSeatId = null;

    // Reset title and button text
    document.getElementById("addSeatFormTitle").textContent = "Add New Seat";
    document.getElementById("addSeatSubmitBtn").textContent = "Add Seat";

    // Reset form submit handler
    form.onsubmit = (event) => this.handleAddSeat(event);
  }

  async handleAddSeat(event) {
    event.preventDefault();

    const seatData = {
      seat_number: document.getElementById("seatNumber").value,
      location_area: document.getElementById("locationArea").value,
      status: document.getElementById("seatStatus").value,
    };

    try {
      this.showSpinner();
      await this.apiCall("POST", "/seats", seatData);
      this.showToast("Seat added successfully!", "success");
      this.hideAddSeatForm();
      this.loadAllSeats();
    } catch (error) {
      this.showToast(error.message, "error");
    } finally {
      this.hideSpinner();
    }
  }

  showEditSeat(seatId) {
    const seatCard = document
      .querySelector(
        `#seatsGrid .admin-card button[onclick="app.showEditSeat(${seatId})"]`
      )
      .closest(".admin-card");

    const seatNumber = seatCard
      .querySelector("h5")
      .textContent.replace("Seat ", "");
    const locationArea = seatCard.querySelector(
      ".reservation-detail-value"
    ).textContent;
    const status = seatCard.querySelector(".reservation-status").textContent;

    // Show the form
    const form = document.getElementById("addSeatForm");
    form.classList.remove("hidden");

    // Set title and button text
    document.getElementById("addSeatFormTitle").textContent = "Edit Seat";
    document.getElementById("addSeatSubmitBtn").textContent = "Update Seat";

    document.getElementById("seatNumber").value = seatNumber;
    document.getElementById("locationArea").value = locationArea;
    document.getElementById("seatStatus").value = status;

    this.editingSeatId = seatId;

    // Change form submit handler to update
    form.onsubmit = (event) => this.handleUpdateSeat(event);

    // Scroll to form
    form.scrollIntoView({ behavior: "smooth" });
  }

  async handleUpdateSeat(event) {
    event.preventDefault();

    if (!this.editingSeatId) return;

    const seatData = {
      seat_number: document.getElementById("seatNumber").value,
      location_area: document.getElementById("locationArea").value,
      status: document.getElementById("seatStatus").value,
    };

    try {
      this.showSpinner();
      await this.apiCall("PUT", `/seats/${this.editingSeatId}`, seatData);
      this.showToast("Seat updated successfully!", "success");
      this.hideAddSeatForm();
      this.loadAllSeats();
      this.editingSeatId = null;
    } catch (error) {
      this.showToast(error.message, "error");
    } finally {
      this.hideSpinner();
    }
  }

  async deleteSeat(seatId) {
    this.showModal(
      "Delete Seat",
      "Are you sure you want to delete this seat? This action cannot be undone.",
      "Delete Seat",
      async () => {
        try {
          this.showSpinner();
          await this.apiCall("DELETE", `/seats/${seatId}`);
          this.showToast("Seat deleted successfully", "success");
          this.loadAllSeats();
        } catch (error) {
          this.showToast(error.message, "error");
        } finally {
          this.hideSpinner();
        }
      }
    );
  }

  async loadAllReservations() {
    try {
      const date =
        document.getElementById("reservationDateFilter")?.value || "";
      const status =
        document.getElementById("adminReservationStatusFilter")?.value || "";

      let url = "/reservations";
      const params = [];
      if (date) params.push(`date=${date}`);
      if (status) params.push(`status=${status}`);

      if (params.length > 0) {
        url += "?" + params.join("&");
      }

      const response = await this.apiCall("GET", url);
      this.displayReservations(
        response.reservations,
        "allReservationsGrid",
        false
      );
    } catch (error) {
      this.showToast(error.message, "error");
    }
  }

  async generateReport() {
    const startDate = document.getElementById("reportStartDate").value;
    const endDate = document.getElementById("reportEndDate").value;

    if (!startDate || !endDate) {
      this.showToast("Please select both start and end dates", "warning");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      this.showToast("Start date cannot be later than end date", "warning");
      return;
    }

    try {
      this.showSpinner();
      const response = await this.apiCall(
        "GET",
        `/admin/reports/usage?start_date=${startDate}&end_date=${endDate}`
      );
      this.displayReport(response);
    } catch (error) {
      this.showToast(error.message, "error");
    } finally {
      this.hideSpinner();
    }
  }

  displayReport(data) {
    const container = document.getElementById("reportResults");

    container.innerHTML = `
            <div class="report-summary">
                <div class="report-summary-item">
                    <h4>${data.summary.total_reservations}</h4>
                    <p>Total Reservations</p>
                </div>
                <div class="report-summary-item">
                    <h4>${data.summary.average_daily_reservations}</h4>
                    <p>Avg. Daily Reservations</p>
                </div>
                <div class="report-summary-item">
                    <h4>${data.summary.most_used_seat || "N/A"}</h4>
                    <p>Most Used Seat</p>
                </div>
                <div class="report-summary-item">
                    <h4>${data.summary.most_active_intern || "N/A"}</h4>
                    <p>Most Active Intern</p>
                </div>
            </div>

            <h5>Seat Usage Details</h5>
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Seat Number</th>
                        <th>Location</th>
                        <th>Total Bookings</th>
                        <th>Unique Users</th>
                        <th>Utilization %</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.seat_usage
                      .map(
                        (seat) => `
                        <tr>
                            <td>${seat.seat_number}</td>
                            <td>${seat.location_area}</td>
                            <td>${seat.total_bookings}</td>
                            <td>${seat.unique_users}</td>
                            <td>${seat.utilization_percentage}%</td>
                        </tr>
                    `
                      )
                      .join("")}
                </tbody>
            </table>

            <h5 class="mt-4">Top Users</h5>
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Intern Name</th>
                        <th>Email</th>
                        <th>Total Reservations</th>
                        <th>Unique Seats Used</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.intern_usage
                      .slice(0, 10)
                      .map(
                        (intern) => `
                        <tr>
                            <td>${intern.intern_name}</td>
                            <td>${intern.intern_email}</td>
                            <td>${intern.total_reservations}</td>
                            <td>${intern.unique_seats_used}</td>
                        </tr>
                    `
                      )
                      .join("")}
                </tbody>
            </table>
        `;
  }

  async downloadReportCSV() {
    const startDate = document.getElementById("reportStartDate").value;
    const endDate = document.getElementById("reportEndDate").value;

    if (!startDate || !endDate) {
      this.showToast("Please select both start and end dates", "warning");
      return;
    }

    try {
      const response = await fetch(
        `${this.apiBase}/admin/reports/usage?start_date=${startDate}&end_date=${endDate}&format=csv`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to download report");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `seat-usage-report-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      this.showToast("Report downloaded successfully!", "success");
    } catch (error) {
      this.showToast(error.message, "error");
    }
  }
}

// Initialize the application
const app = new SeatReservationApp();

// Global event handlers
window.showLogin = () => app.showLogin();
window.showRegister = () => app.showRegister();
window.handleLogin = (event) => app.handleLogin(event);
window.handleRegister = (event) => app.handleRegister(event);
window.logout = () => app.logout();
window.showTab = (tabName) => app.showTab(tabName);
window.showAdminTab = (tabName) => app.showAdminTab(tabName);
window.searchAvailableSeats = () => app.searchAvailableSeats();
window.confirmBooking = () => app.confirmBooking();
window.loadMyReservations = () => app.loadMyReservations();
window.showAddSeatForm = () => app.showAddSeatForm();
window.hideAddSeatForm = () => app.hideAddSeatForm();
window.handleAddSeat = (event) => app.handleAddSeat(event);
window.loadAllReservations = () => app.loadAllReservations();
window.generateReport = () => app.generateReport();
window.downloadReportCSV = () => app.downloadReportCSV();
window.hideModal = () => app.hideModal();
window.confirmModalAction = () => app.confirmModalAction();
