import { fetchAssignments, createAssignment, updateAssignment, deleteAssignment } from "../services/api.js";

export class AssignmentStore {
    constructor() {
        this.state = {
            assignments: [],
            loading: false,
            error: null,
        };
        this.listeners = [];
    }

    on(event, callback) {
        if (event === "update") this.listeners.push(callback);
    }

    notify() {
        this.listeners.forEach(cb => cb());
    }

    getState() {
        return this.state;
    }

    async loadAssignments(params = {}) {
        this.state.loading = true;
        this.state.error = null;
        this.notify();
        try {
            const data = await fetchAssignments(params);
            this.state.assignments = data || [];
        } catch (err) {
            this.state.error = err.message;
        } finally {
            this.state.loading = false;
            this.notify();
        }
    }

    async addAssignment(assignmentData) {
        try {
            await createAssignment(assignmentData);
            await this.loadAssignments(); // reload sau khi thêm
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    async editAssignment(id, assignmentData) {
        try {
            await updateAssignment(id, assignmentData);
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
}