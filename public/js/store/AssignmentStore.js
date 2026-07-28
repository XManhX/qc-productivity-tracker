import { fetchAssignments, createAssignment, updateAssignment, deleteAssignment } from "../services/api.js";

export class AssignmentStore {
    constructor() {
        // Lấy ngày hôm nay dạng YYYY-MM-DD
        const today = new Date().toISOString().slice(0, 10);
        this.state = {
            assignments: [],
            filters: {
                searchQuery: "",
                date: today, // mặc định hôm nay
                page: 1,
                pageSize: 25,
            },
            loading: false,
            error: null,
        };
        this.listeners = [];
    }

    on(event, callback) {
        if (event === "update") this.listeners.push(callback);
    }

    notify() {
        this.listeners.forEach((cb) => cb());
    }

    get items() {
        return this.pagedAssignments;
    }
    get totalItems() {
        return this.filteredAssignments.length;
    }
    get totalPages() {
        return Math.max(1, Math.ceil(this.totalItems / this.state.filters.pageSize));
    }
    get currentPage() {
        return this.state.filters.page;
    }

    get filteredAssignments() {
        const { assignments, filters } = this.state;
        const q = filters.searchQuery.toLowerCase().trim();
        return assignments.filter((a) => {
            const email = (a.user_email || "").toLowerCase();
            const reason = (a.reason || "").toLowerCase();
            const matchQ = !q || email.includes(q) || reason.includes(q);
            return matchQ;
        });
    }

    get pagedAssignments() {
        const start = (this.state.filters.page - 1) * this.state.filters.pageSize;
        return this.filteredAssignments.slice(start, start + this.state.filters.pageSize);
    }

    async loadAssignments(params = {}) {
        this.state.loading = true;
        this.state.error = null;
        this.notify();
        try {
            // Ưu tiên params.date, nếu không có thì dùng filters.date (hôm nay)
            const date = params.date || this.state.filters.date;
            const query = { ...params, date };
            const data = await fetchAssignments(query);
            this.state.assignments = data || [];
            this.state.filters.page = 1; // reset về trang đầu khi load mới
        } catch (err) {
            this.state.error = err.message;
        } finally {
            this.state.loading = false;
            this.notify();
        }
    }

    setFilters(partial) {
        Object.assign(this.state.filters, partial);
        if (!("page" in partial)) this.state.filters.page = 1;
        this.notify();
    }

    setPage(page) {
        if (page === this.state.filters.page) return;
        this.state.filters.page = page;
        this.notify();
    }

    async addAssignment(data) {
        try {
            await createAssignment(data);
            await this.loadAssignments(); // reload với filters hiện tại (bao gồm date)
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    async editAssignment(id, data) {
        try {
            await updateAssignment(id, data);
            await this.loadAssignments();
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    async removeAssignment(id) {
        try {
            await deleteAssignment(id);
            await this.loadAssignments();
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    getStats() {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const todayEnd = todayStart + 86400000;
        const nowTime = now.getTime();

        const total = this.state.assignments.length;
        const today = this.state.assignments.filter(a => {
            const start = new Date(a.start_time).getTime();
            const end = new Date(a.end_time).getTime();
            return start < todayEnd && end > todayStart;
        }).length;
        const active = this.state.assignments.filter(a => {
            const start = new Date(a.start_time).getTime();
            const end = new Date(a.end_time).getTime();
            return start <= nowTime && end >= nowTime;
        }).length;

        return { total, today, active };
    }
}