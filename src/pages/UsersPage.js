import { userStore } from "../store/UserStore.js";
import { UserForm } from "../components/Users/UserForm.js";
import { ImportSection } from "../components/Users/ImportSection.js";
import { UserList } from "../components/Users/UserList.js";

export default class UsersPage {
  constructor(container) {
    container.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div class="lg:col-span-12 space-y-6">
            <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div id="single-user-container"></div>
              <div id="import-section-container"></div>
            </div>
          </div>
          <div class="lg:col-span-12">
            <div id="user-list-container" class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"></div>
          </div>
        </div>
      </div>
    `;
    userStore.loadRoles().then(() => userStore.loadUsers());
    new UserForm(document.getElementById("single-user-container"));
    new ImportSection(document.getElementById("import-section-container"));
    new UserList(document.getElementById("user-list-container"));
  }
}
