let money = [];
let categories = [];
let expenses = [];
let goals = [];
let bills = [];
let currentTab = 'expenses';
let editingExpenseId = null;
let editingMoneyId = null;
let editingBillId = null;

async function loadData() {
    try {
        const [moneyRes, catRes, expRes, goalRes, billRes] = await Promise.all([
            fetch('/api/money'),
            fetch('/api/categories'),
            fetch('/api/expenses'),
            fetch('/api/goals'),
            fetch('/api/bills')
        ]);
        money = await moneyRes.json();
        categories = await catRes.json();
        expenses = await expRes.json();
        goals = await goalRes.json();
        bills = await billRes.json();
        updateDisplay();
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load data. Please try again later.');
    }
}

function calculateTotals() {
    const totalMoney = money.reduce((sum, m) => sum + m.amount, 0);
    const cash = money.filter(m => m.location === 'Cash').reduce((sum, m) => sum + m.amount, 0);
    const bank = money.filter(m => m.location === 'Bank').reduce((sum, m) => sum + m.amount, 0);
    const mytabung = money.filter(m => m.location === 'MyTabung').reduce((sum, m) => sum + m.amount, 0);
    const cashExpenses = expenses.filter(e => e.source === 'Cash').reduce((sum, e) => sum + e.amount, 0);
    const bankExpenses = expenses.filter(e => e.source === 'Bank').reduce((sum, e) => sum + e.amount, 0);
    return {
        spendable: (cash + bank) - (cashExpenses + bankExpenses),
        total: totalMoney - (cashExpenses + bankExpenses),
        cash: cash - cashExpenses,
        bank: bank - bankExpenses,
        mytabung
    };
}

function isWithinFiveDays(dueDate) {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due - today;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays <= 5; // Show if due within 5 days or overdue
}

function updateDisplay() {
    const totals = calculateTotals();
    document.getElementById('totalAmount').textContent = 
        currentTab === 'expenses' ? `RM ${totals.spendable.toFixed(2)}`
        : currentTab === 'goals' ? `RM ${totals.mytabung.toFixed(2)}`
        : currentTab === 'bills' ? `RM ${bills.filter(b => !b.paid && isWithinFiveDays(b.due_date)).reduce((sum, b) => sum + (b.amount || 0), 0).toFixed(2)}`
        : `RM ${totals.total.toFixed(2)}`;
    document.getElementById('cashBalance').textContent = totals.cash.toFixed(2);
    document.getElementById('bankBalance').textContent = totals.bank.toFixed(2);
    document.getElementById('mytabungBalance').textContent = totals.mytabung.toFixed(2);

    const billsCategory = categories.find(cat => cat.name === 'Bills');
    if (billsCategory) {
        const totalBillsBudget = bills.filter(b => !b.paid && isWithinFiveDays(b.due_date)).reduce((sum, b) => sum + (b.amount || 0), 0);
        fetch(`/api/categories/${billsCategory.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Bills', budget: totalBillsBudget })
        }).catch(err => console.error('Error updating Bills budget:', err));
    }

    const categoryList = document.getElementById('categoryList');
    categoryList.innerHTML = categories.map(cat => {
        const spent = expenses.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + e.amount, 0);
        const percent = cat.budget ? (spent / cat.budget) * 100 : 0;
        return `
            <div class="category-card ${percent >= 100 ? 'over' : percent >= 80 ? 'nearing' : ''}">
                <span>${cat.name}: RM ${spent.toFixed(2)} / RM ${cat.budget.toFixed(2)}</span>
                ${cat.name !== 'Bills' ? `<button onclick="deleteCategory(${cat.id})">Delete</button>` : ''}
            </div>
        `;
    }).join('');

    const categorySelect = document.getElementById('categorySelect');
    categorySelect.innerHTML = '<option value="">Select Category</option>' + 
        categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');

    const expenseHistory = document.getElementById('expenseHistory');
    expenseHistory.innerHTML = expenses.map(exp => `
        <div class="history-item">
            <span>${exp.description}: RM ${exp.amount.toFixed(2)} (${exp.source}, ${exp.category_name || 'Uncategorized'})</span>
            <div>
                <button class="edit" onclick="editExpense(${exp.id})">Edit</button>
                <button onclick="deleteExpense(${exp.id})">Delete</button>
            </div>
        </div>
    `).join('');

    const moneyHistory = document.getElementById('moneyHistory');
    moneyHistory.innerHTML = money.map(m => `
        <div class="history-item">
            <span>RM ${m.amount.toFixed(2)} (${m.location})</span>
            <button class="edit" onclick="editMoney(${m.id})">Edit</button>
        </div>
    `).join('');

    const budgetHistory = document.getElementById('budgetHistory');
    budgetHistory.innerHTML = categories.map(cat => {
        const catExpenses = expenses.filter(e => e.category_id === cat.id);
        return catExpenses.length ? `
            <div class="history-item"><strong>${cat.name}</strong>:</div>
            ${catExpenses.map(exp => `
                <div class="history-item" style="padding-left: 20px;">
                    ${exp.description}: RM ${exp.amount.toFixed(2)} (${exp.source})
                </div>
            `).join('')}
        ` : '';
    }).join('') || '<div class="history-item">No budget history yet</div>';

    const goalList = document.getElementById('goalList');
    goalList.innerHTML = goals.map(goal => {
        const progress = Math.min((totals.mytabung / goal.target_amount) * 100, 100);
        return `
            <div class="goal-card">
                <div>
                    <span>${goal.name}: RM ${totals.mytabung.toFixed(2)} / RM ${goal.target_amount.toFixed(2)}</span>
                    <div class="progress-bar"><div class="progress" style="width: ${progress}%"></div></div>
                    <small>Deadline: ${goal.deadline}</small>
                </div>
                <button onclick="deleteGoal(${goal.id})">Delete</button>
            </div>
        `;
    }).join('');

    const unpaidBillsList = document.getElementById('unpaidBillsList');
    unpaidBillsList.innerHTML = bills.filter(b => !b.paid && isWithinFiveDays(b.due_date)).map(bill => `
        <div class="bill-item">
            <span>${bill.name}: RM ${bill.amount.toFixed(2)} (Due: ${bill.due_date})</span>
            <div>
                <button class="paid" id="paid-btn-${bill.id}" onclick="markBillPaid(${bill.id}, this)">Paid</button>
                <button class="delete" id="delete-btn-${bill.id}" onclick="deleteBill(${bill.id}, this)">Delete</button>
            </div>
        </div>
    `).join('') || '<div class="bill-item">No unpaid bills due within 5 days</div>';

    const paidBillsList = document.getElementById('paidBillsList');
    const currentMonth = new Date().toISOString().slice(0, 7); // e.g., "2025-03"
    paidBillsList.innerHTML = bills.filter(b => b.paid && b.due_date.startsWith(currentMonth)).map(bill => `
        <div class="bill-item">
            <span>${bill.name}: RM ${bill.amount.toFixed(2)} (Due: ${bill.due_date})</span>
            <span style="color: #33cc33;">Paid</span>
        </div>
    `).join('') || '<div class="bill-item">No bills paid this month</div>';

    const billsHistory = document.getElementById('billsHistory');
    billsHistory.innerHTML = bills.map(bill => `
        <div class="history-item">
            <span>${bill.name}: RM ${bill.amount.toFixed(2)} (Due: ${bill.due_date}, ${bill.paid ? 'Paid' : 'Unpaid'})</span>
            <button onclick="editBill(${bill.id})">Edit</button>
            ${bill.paid ? `<button onclick="reverseBillPayment(${bill.id})">Reverse to Unpaid</button>` : ''}
        </div>
    `).join('') || '<div class="history-item">No bills history yet</div>';
}

async function addMoney() {
    const amount = parseFloat(document.getElementById('moneyAmount').value);
    const location = document.getElementById('moneyLocation').value;
    if (!amount) return showError('Please enter an amount');
    try {
        const response = await fetch(editingMoneyId ? `/api/money/${editingMoneyId}` : '/api/money', {
            method: editingMoneyId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, location })
        });
        if (!response.ok) throw new Error(editingMoneyId ? 'Failed to update money' : 'Failed to add money');
        resetForm('moneyForm');
        await loadData();
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
    }
}

async function editMoney(id) {
    const moneyEntry = money.find(m => m.id === id);
    if (!moneyEntry) return;
    editingMoneyId = id;
    document.getElementById('moneyAmount').value = moneyEntry.amount;
    document.getElementById('moneyLocation').value = moneyEntry.location;
    document.getElementById('moneyFormTitle').textContent = 'Edit Money';
    document.getElementById('moneyFormButton').textContent = 'Save Changes';
    hideModal('moneyHistoryModal');
    showModal('moneyForm');
}

async function addExpense() {
    const amount = parseFloat(document.getElementById('expAmount').value);
    const description = document.getElementById('description').value;
    const source = document.getElementById('moneySource').value;
    const category_id = document.getElementById('categorySelect').value || null;
    const totals = calculateTotals();

    if (!amount || !description) return showError('Please fill all fields');
    if (source === 'Cash' && amount > totals.cash) return showError('Not enough cash!');
    if (source === 'Bank' && amount > totals.bank) return showError('Not enough money in bank!');

    if (category_id) {
        const category = categories.find(cat => cat.id === parseInt(category_id));
        const currentSpent = expenses
            .filter(e => e.category_id === category.id && (!editingExpenseId || e.id !== editingExpenseId))
            .reduce((sum, e) => sum + e.amount, 0);
        const newSpent = currentSpent + amount;
        const percent = (newSpent / category.budget) * 100;
        if (percent >= 100 && !confirm(`Warning: This expense will exceed your ${category.name} budget (RM ${newSpent.toFixed(2)} / RM ${category.budget.toFixed(2)}). Proceed?`)) {
            return;
        } else if (percent >= 80) {
            alert(`Heads up: You're nearing your ${category.name} budget (RM ${newSpent.toFixed(2)} / RM ${category.budget.toFixed(2)}).`);
        }
    }

    try {
        const response = await fetch(editingExpenseId ? `/api/expenses/${editingExpenseId}` : '/api/expenses', {
            method: editingExpenseId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, description, source, category_id })
        });
        if (!response.ok) throw new Error(editingExpenseId ? 'Failed to update expense' : 'Failed to add expense');
        resetForm('expenseForm');
        await loadData();
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
    }
}

async function editExpense(id) {
    const expense = expenses.find(e => e.id === id);
    if (!expense) return;
    editingExpenseId = id;
    document.getElementById('expAmount').value = expense.amount;
    document.getElementById('description').value = expense.description;
    document.getElementById('moneySource').value = expense.source;
    document.getElementById('categorySelect').value = expense.category_id || '';
    document.getElementById('expenseFormTitle').textContent = 'Edit Expense';
    document.getElementById('expenseFormButton').textContent = 'Save Changes';
    hideModal('expenseHistoryModal');
    showModal('expenseForm');
}

async function deleteExpense(id) {
    try {
        const response = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete expense');
        await loadData();
    } catch (error) {
        console.error('Error deleting expense:', error);
        showError('Failed to delete expense');
    }
}

async function addCategory() {
    const name = document.getElementById('categoryName').value;
    const budget = parseFloat(document.getElementById('categoryAmount').value);
    if (!name || !budget) return showError('Please fill all fields');
    if (name === 'Bills') return showError('Cannot add a category named "Bills" - it is reserved.');
    try {
        const response = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, budget })
        });
        if (!response.ok) throw new Error('Failed to add category');
        resetForm('categoryForm');
        await loadData();
    } catch (error) {
        console.error('Error adding category:', error);
        showError('Failed to add category');
    }
}

async function deleteCategory(id) {
    const category = categories.find(cat => cat.id === id);
    if (category.name === 'Bills') return showError('Cannot delete the "Bills" category.');
    if (expenses.some(exp => exp.category_id === id)) return showError('Cannot delete category with existing expenses');
    try {
        const response = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete category');
        await loadData();
    } catch (error) {
        console.error('Error deleting category:', error);
        showError('Failed to delete category');
    }
}

async function addGoal() {
    const name = document.getElementById('goalName').value;
    const target_amount = parseFloat(document.getElementById('goalAmount').value);
    const deadline = document.getElementById('goalDeadline').value;
    if (!name || !target_amount || !deadline) return showError('Please fill all fields');
    try {
        const response = await fetch('/api/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, target_amount, deadline })
        });
        if (!response.ok) throw new Error('Failed to add goal');
        resetForm('goalForm');
        await loadData();
    } catch (error) {
        console.error('Error adding goal:', error);
        showError('Failed to add goal');
    }
}

async function deleteGoal(id) {
    try {
        const response = await fetch(`/api/goals/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete goal');
        await loadData();
    } catch (error) {
        console.error('Error deleting goal:', error);
        showError('Failed to delete goal');
    }
}

async function saveBill() {
    const name = document.getElementById('billName').value;
    const amount = parseFloat(document.getElementById('billAmount').value);
    const due_date = document.getElementById('billDueDate').value;
    const is_fixed = parseInt(document.getElementById('billType').value);
    if (!name || (is_fixed && !amount) || !due_date) return showError('Please fill all fields (amount optional for dynamic bills)');

    const bill = editingBillId ? bills.find(b => b.id === editingBillId) : null;
    const billData = { name, amount: amount || 0, due_date, is_fixed, paid: bill ? bill.paid : 0 };

    try {
        const response = await fetch(editingBillId ? `/api/bills/${editingBillId}` : '/api/bills', {
            method: editingBillId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(billData)
        });
        if (!response.ok) throw new Error(await response.text());
        resetForm('billForm');
        await loadData();
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
    }
}

function editBill(id) {
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    editingBillId = id;
    document.getElementById('billName').value = bill.name;
    document.getElementById('billAmount').value = bill.amount;
    document.getElementById('billDueDate').value = bill.due_date;
    document.getElementById('billType').value = bill.is_fixed ? '1' : '0';
    document.getElementById('billFormTitle').textContent = 'Edit Bill';
    document.getElementById('billFormButton').textContent = 'Save Changes';
    hideModal('billsHistoryModal');
    showModal('billForm');
}

async function markBillPaid(id, button) {
    const bill = bills.find(b => b.id === id);
    if (!bill) return showError('Bill not found');
    if (bill.paid) return showError('Bill is already paid');

    button.disabled = true;
    button.textContent = 'Processing...';

    const totals = calculateTotals();
    const source = totals.cash >= bill.amount ? 'Cash' : 'Bank';
    if (source === 'Cash' && bill.amount > totals.cash) {
        button.disabled = false;
        button.textContent = 'Paid';
        return showError('Not enough cash to pay this bill!');
    }
    if (source === 'Bank' && bill.amount > totals.bank) {
        button.disabled = false;
        button.textContent = 'Paid';
        return showError('Not enough money in bank to pay this bill!');
    }

    try {
        const response = await fetch(`/api/bills/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: bill.name,
                amount: bill.amount,
                is_fixed: bill.is_fixed,
                due_date: bill.due_date,
                paid: 1
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to mark bill as paid: ${errorText}`);
        }
        const result = await response.json();
        if (!result.success) throw new Error('Server did not confirm success');

        const billsCategory = categories.find(cat => cat.name === 'Bills');
        if (billsCategory) {
            const expenseResponse = await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: bill.amount,
                    description: `Paid: ${bill.name}`,
                    source,
                    category_id: billsCategory.id
                })
            });
            if (!expenseResponse.ok) throw new Error('Failed to record expense');
        }
        await loadData();
    } catch (error) {
        console.error('Error marking bill as paid:', error.message);
        showError(`Failed to mark bill as paid: ${error.message}`);
        button.disabled = false;
        button.textContent = 'Paid';
    }
}

async function deleteBill(id, button) {
    if (!confirm('Are you sure you want to delete this bill? This will also remove any associated expense if paid.')) return;

    button.disabled = true;
    button.textContent = 'Deleting...';

    const bill = bills.find(b => b.id === id);
    if (!bill) {
        button.disabled = false;
        button.textContent = 'Delete';
        return showError('Bill not found');
    }

    try {
        const billResponse = await fetch(`/api/bills/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!billResponse.ok) throw new Error('Failed to delete bill');

        if (bill.paid) {
            const expense = expenses.find(e => e.description === `Paid: ${bill.name}`);
            if (expense) {
                const expenseResponse = await fetch(`/api/expenses/${expense.id}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (!expenseResponse.ok) throw new Error('Failed to delete associated expense');
            }
        }
        await loadData();
    } catch (error) {
        console.error('Error deleting bill:', error.message);
        showError(`Failed to delete bill: ${error.message}`);
        button.disabled = false;
        button.textContent = 'Delete';
    }
}

async function reverseBillPayment(id) {
    const bill = bills.find(b => b.id === id);
    if (!bill || !bill.paid) return;
    try {
        await fetch(`/api/bills/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...bill, paid: 0 })
        });
        const expense = expenses.find(e => e.description === `Paid: ${bill.name}`);
        if (expense) await fetch(`/api/expenses/${expense.id}`, { method: 'DELETE' });
        await loadData();
    } catch (error) {
        console.error('Error reversing bill payment:', error);
        showError('Failed to reverse bill payment');
    }
}

async function resetBudget() {
    if (!confirm('Are you sure you want to reset the budget? This will archive expenses, adjust budgets, and reset bills.')) return;
    try {
        const response = await fetch('/api/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error('Failed to reset budget');
        await loadData();
        alert('Budget reset successfully!');
    } catch (error) {
        console.error('Error resetting budget:', error);
        showError('Failed to reset budget');
    }
}

function showTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    document.querySelector(`button[onclick="showTab('${tabName}')"]`).classList.add('active');
    currentTab = tabName;
    updateDisplay();
}

function showModal(modalId) {
    updateDisplay();
    document.getElementById(modalId).style.display = 'flex';
}

function hideModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    resetForm(modalId);
}

function resetForm(modalId) {
    if (modalId === 'expenseForm') {
        editingExpenseId = null;
        document.getElementById('expAmount').value = '';
        document.getElementById('description').value = '';
        document.getElementById('moneySource').value = 'Cash';
        document.getElementById('categorySelect').value = '';
        document.getElementById('expenseFormTitle').textContent = 'Add Expense';
        document.getElementById('expenseFormButton').textContent = 'Add Expense';
    } else if (modalId === 'moneyForm') {
        editingMoneyId = null;
        document.getElementById('moneyAmount').value = '';
        document.getElementById('moneyLocation').value = 'Cash';
        document.getElementById('moneyFormTitle').textContent = 'Add Money';
        document.getElementById('moneyFormButton').textContent = 'Add Money';
    } else if (modalId === 'billForm') {
        editingBillId = null;
        document.getElementById('billName').value = '';
        document.getElementById('billAmount').value = '';
        document.getElementById('billDueDate').value = '';
        document.getElementById('billType').value = '1';
        document.getElementById('billFormTitle').textContent = 'Add Bill';
        document.getElementById('billFormButton').textContent = 'Add Bill';
    } else if (modalId === 'categoryForm') {
        document.getElementById('categoryName').value = '';
        document.getElementById('categoryAmount').value = '';
    } else if (modalId === 'goalForm') {
        document.getElementById('goalName').value = '';
        document.getElementById('goalAmount').value = '';
        document.getElementById('goalDeadline').value = '';
    }
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #ff4444; color: white; padding: 10px 20px; border-radius: 5px; z-index: 2000;';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 3000);
}

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => e.target === modal && hideModal(modal.id));
});

loadData();
setInterval(loadData, 60000); // Refresh every minute