let money = [];
let categories = [];
let expenses = [];
let goals = [];
let bills = [];
let currentTab = 'expenses';
let editingExpenseId = null;
let editingMoneyId = null;
let editingBillId = null; // Added to track the bill being edited

async function loadData() {
    try {
        money = await (await fetch('/api/money')).json();
        categories = await (await fetch('/api/categories')).json();
        expenses = await (await fetch('/api/expenses')).json();
        goals = await (await fetch('/api/goals')).json();
        bills = await (await fetch('/api/bills')).json();
        updateDisplay();
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Failed to load data. Please check the server.');
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
        mytabung: mytabung
    };
}

function updateDisplay() {
    const totals = calculateTotals();
    document.getElementById('totalAmount').textContent = 
        currentTab === 'expenses' 
            ? `$${totals.spendable.toFixed(2)}`
            : currentTab === 'goals' 
            ? `$${totals.mytabung.toFixed(2)}`
            : currentTab === 'bills'
            ? `$${bills.filter(b => !b.paid).reduce((sum, b) => sum + (b.amount || 0), 0).toFixed(2)}`
            : `$${totals.total.toFixed(2)}`;
    document.getElementById('cashBalance').textContent = totals.cash.toFixed(2);
    document.getElementById('bankBalance').textContent = totals.bank.toFixed(2);
    document.getElementById('mytabungBalance').textContent = totals.mytabung.toFixed(2);

    // Update Bills category budget
    const billsCategory = categories.find(cat => cat.name === 'Bills');
    if (billsCategory) {
        const totalBillsBudget = bills.filter(b => !b.paid).reduce((sum, b) => sum + (b.amount || 0), 0);
        fetch(`/api/categories/${billsCategory.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Bills', budget: totalBillsBudget })
        }).catch(err => console.error('Error updating Bills budget:', err));
    }

    // Categories List (Budget Tab)
    const categoryList = document.getElementById('categoryList');
    categoryList.innerHTML = '';
    categories.forEach(cat => {
        const spent = expenses
            .filter(e => e.category_id === cat.id)
            .reduce((sum, e) => sum + e.amount, 0);
        const percent = (spent / cat.budget) * 100;
        const div = document.createElement('div');
        div.className = 'category-card';
        if (percent >= 100) div.classList.add('over');
        else if (percent >= 80) div.classList.add('nearing');
        div.innerHTML = `
            <span>${cat.name}: $${spent.toFixed(2)} / $${cat.budget.toFixed(2)}</span>
            ${cat.name !== 'Bills' ? `<button onclick="deleteCategory(${cat.id})">Delete</button>` : ''}
        `;
        categoryList.appendChild(div);
    });

    // Category Selector (Expense Form)
    const categorySelect = document.getElementById('categorySelect');
    categorySelect.innerHTML = '<option value="">Select Category</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        categorySelect.appendChild(option);
    });

    // Expense History
    const expenseHistory = document.getElementById('expenseHistory');
    expenseHistory.innerHTML = '';
    expenses.forEach(exp => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <span>${exp.description}: $${exp.amount.toFixed(2)} (${exp.source}, ${exp.category_name || 'Uncategorized'})</span>
            <div>
                <button class="edit" onclick="editExpense(${exp.id})">Edit</button>
                <button onclick="deleteExpense(${exp.id})">Delete</button>
            </div>
        `;
        expenseHistory.appendChild(div);
    });

    // Money History
    const moneyHistory = document.getElementById('moneyHistory');
    moneyHistory.innerHTML = '';
    money.forEach(m => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <span>$${m.amount.toFixed(2)} (${m.location})</span>
            <div>
                <button class="edit" onclick="editMoney(${m.id})">Edit</button>
            </div>
        `;
        moneyHistory.appendChild(div);
    });

    // Budget History
    const budgetHistory = document.getElementById('budgetHistory');
    budgetHistory.innerHTML = '';
    categories.forEach(cat => {
        const categoryExpenses = expenses.filter(e => e.category_id === cat.id);
        if (categoryExpenses.length > 0) {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `<strong>${cat.name}</strong>:`;
            budgetHistory.appendChild(div);
            categoryExpenses.forEach(exp => {
                const subDiv = document.createElement('div');
                subDiv.className = 'history-item';
                subDiv.style.paddingLeft = '20px';
                subDiv.innerHTML = `${exp.description}: $${exp.amount.toFixed(2)} (${exp.source})`;
                budgetHistory.appendChild(subDiv);
            });
        }
    });
    if (budgetHistory.innerHTML === '') {
        budgetHistory.innerHTML = '<div class="history-item">No budget history yet</div>';
    }

    // Goals List
    const goalList = document.getElementById('goalList');
    goalList.innerHTML = '';
    goals.forEach(goal => {
        const progress = Math.min((totals.mytabung / goal.target_amount) * 100, 100);
        const div = document.createElement('div');
        div.className = 'goal-card';
        div.innerHTML = `
            <div>
                <span>${goal.name}: $${totals.mytabung.toFixed(2)} / $${goal.target_amount.toFixed(2)}</span>
                <div class="progress-bar"><div class="progress" style="width: ${progress}%"></div></div>
                <small>Deadline: ${goal.deadline}</small>
            </div>
            <button onclick="deleteGoal(${goal.id})">Delete</button>
        `;
        goalList.appendChild(div);
    });

    // Bills List (Unpaid)
    const billList = document.getElementById('billList');
    billList.innerHTML = bills.filter(b => !b.paid).map(bill => `
        <div class="bill-item">
            <span>${bill.name}: $${bill.amount.toFixed(2)} (Due: ${bill.due_date})</span>
            <button class="paid" onclick="markBillPaid(${bill.id})">Paid</button>
        </div>
    `).join('') || '<div class="bill-item">No unpaid bills</div>';

    // Bills History
    const billsHistory = document.getElementById('billsHistory');
    billsHistory.innerHTML = bills.map(bill => `
        <div class="history-item">
            <span>${bill.name}: $${bill.amount.toFixed(2)} (Due: ${bill.due_date}, ${bill.paid ? 'Paid' : 'Unpaid'})</span>
            <button onclick="editBill(${bill.id})">Edit</button>
            ${bill.paid ? `<button onclick="reverseBillPayment(${bill.id})">Reverse to Unpaid</button>` : ''}
        </div>
    `).join('') || '<div class="history-item">No bills history yet</div>';
}

async function addMoney() {
    const amount = parseFloat(document.getElementById('moneyAmount').value);
    const location = document.getElementById('moneyLocation').value;
    if (!amount) {
        alert('Please enter an amount');
        return;
    }
    try {
        let response;
        if (editingMoneyId) {
            response = await fetch(`/api/money/${editingMoneyId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, location })
            });
        } else {
            response = await fetch('/api/money', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, location })
            });
        }
        if (!response.ok) throw new Error(editingMoneyId ? 'Failed to update money' : 'Failed to add money');
        document.getElementById('moneyAmount').value = '';
        document.getElementById('moneyLocation').value = 'Cash';
        document.getElementById('moneyFormTitle').textContent = 'Add Money';
        document.getElementById('moneyFormButton').textContent = 'Add Money';
        editingMoneyId = null;
        hideModal('moneyForm');
        await loadData();
    } catch (error) {
        console.error('Error:', error);
        alert(editingMoneyId ? 'Failed to update money' : 'Failed to add money');
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
    
    if (!amount || !description) {
        alert('Please fill all fields');
        return;
    }
    if (source === 'Cash' && amount > totals.cash) {
        alert('Not enough cash!');
        return;
    }
    if (source === 'Bank' && amount > totals.bank) {
        alert('Not enough money in bank!');
        return;
    }

    if (category_id) {
        const category = categories.find(cat => cat.id === parseInt(category_id));
        const currentSpent = expenses
            .filter(e => e.category_id === category.id && (!editingExpenseId || e.id !== editingExpenseId))
            .reduce((sum, e) => sum + e.amount, 0);
        const newSpent = currentSpent + amount;
        const percent = (newSpent / category.budget) * 100;
        if (percent >= 100) {
            if (!confirm(`Warning: This expense will exceed your ${category.name} budget ($${newSpent.toFixed(2)} / $${category.budget.toFixed(2)}). Proceed?`)) {
                return;
            }
        } else if (percent >= 80) {
            alert(`Heads up: You're nearing your ${category.name} budget ($${newSpent.toFixed(2)} / $${category.budget.toFixed(2)}).`);
        }
    }

    try {
        let response;
        if (editingExpenseId) {
            response = await fetch(`/api/expenses/${editingExpenseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, description, source, category_id })
            });
        } else {
            response = await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, description, source, category_id })
            });
        }
        if (!response.ok) throw new Error(editingExpenseId ? 'Failed to update expense' : 'Failed to add expense');
        document.getElementById('expAmount').value = '';
        document.getElementById('description').value = '';
        document.getElementById('moneySource').value = 'Cash';
        document.getElementById('categorySelect').value = '';
        document.getElementById('expenseFormTitle').textContent = 'Add Expense';
        document.getElementById('expenseFormButton').textContent = 'Add Expense';
        editingExpenseId = null;
        hideModal('expenseForm');
        await loadData();
    } catch (error) {
        console.error('Error:', error);
        alert(editingExpenseId ? 'Failed to update expense' : 'Failed to add expense');
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
        const response = await fetch(`/api/expenses/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete expense');
        await loadData();
    } catch (error) {
        console.error('Error deleting expense:', error);
        alert('Failed to delete expense');
    }
}

async function addCategory() {
    const name = document.getElementById('categoryName').value;
    const budget = parseFloat(document.getElementById('categoryAmount').value);
    if (!name || !budget) {
        alert('Please fill all fields');
        return;
    }
    if (name === 'Bills') {
        alert('Cannot add a category named "Bills" - it is reserved.');
        return;
    }
    try {
        const response = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, budget })
        });
        if (!response.ok) throw new Error('Failed to add category');
        document.getElementById('categoryName').value = '';
        document.getElementById('categoryAmount').value = '';
        hideModal('categoryForm');
        await loadData();
    } catch (error) {
        console.error('Error adding category:', error);
        alert('Failed to add category');
    }
}

async function deleteCategory(id) {
    const category = categories.find(cat => cat.id === id);
    if (category.name === 'Bills') {
        alert('Cannot delete the "Bills" category.');
        return;
    }
    if (expenses.some(exp => exp.category_id === id)) {
        alert('Cannot delete category with existing expenses');
        return;
    }
    try {
        const response = await fetch(`/api/categories/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete category');
        await loadData();
    } catch (error) {
        console.error('Error deleting category:', error);
        alert('Failed to delete category');
    }
}

async function addGoal() {
    const name = document.getElementById('goalName').value;
    const target_amount = parseFloat(document.getElementById('goalAmount').value);
    const deadline = document.getElementById('goalDeadline').value;
    if (!name || !target_amount || !deadline) {
        alert('Please fill all fields');
        return;
    }
    try {
        const response = await fetch('/api/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, target_amount, deadline })
        });
        if (!response.ok) throw new Error('Failed to add goal');
        document.getElementById('goalName').value = '';
        document.getElementById('goalAmount').value = '';
        document.getElementById('goalDeadline').value = '';
        hideModal('goalForm');
        await loadData();
    } catch (error) {
        console.error('Error adding goal:', error);
        alert('Failed to add goal');
    }
}

async function deleteGoal(id) {
    try {
        const response = await fetch(`/api/goals/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete goal');
        await loadData();
    } catch (error) {
        console.error('Error deleting goal:', error);
        alert('Failed to delete goal');
    }
}

async function saveBill() {
    const name = document.getElementById('billName').value;
    const amount = parseFloat(document.getElementById('billAmount').value);
    const due_date = document.getElementById('billDueDate').value;
    const is_fixed = parseInt(document.getElementById('billType').value);
    
    if (!name || (is_fixed && !amount) || !due_date) {
        alert('Please fill all fields (amount is optional for dynamic bills)');
        return;
    }
    
    const bill = editingBillId ? bills.find(b => b.id === editingBillId) : null;
    const billData = {
        name,
        amount: amount || 0,
        due_date,
        is_fixed,
        paid: bill ? bill.paid : 0 // Include paid status, default to 0 for new bills
    };
    
    try {
        let response;
        if (editingBillId) {
            response = await fetch(`/api/bills/${editingBillId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(billData)
            });
        } else {
            response = await fetch('/api/bills', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(billData)
            });
        }
        if (!response.ok) {
            const errorText = await response.text(); // Get detailed error message
            throw new Error(editingBillId ? `Failed to update bill: ${errorText}` : `Failed to add bill: ${errorText}`);
        }
        document.getElementById('billName').value = '';
        document.getElementById('billAmount').value = '';
        document.getElementById('billDueDate').value = '';
        document.getElementById('billType').value = '1';
        document.getElementById('billFormTitle').textContent = 'Add Bill';
        document.getElementById('billFormButton').textContent = 'Add Bill';
        editingBillId = null;
        hideModal('billForm');
        await loadData();
    } catch (error) {
        console.error('Error:', error);
        alert(error.message); // Show detailed error
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
    showModal('billForm');
}

async function markBillPaid(id) {
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    const totals = calculateTotals();
    const source = totals.cash >= bill.amount ? 'Cash' : 'Bank';
    if (source === 'Cash' && bill.amount > totals.cash) {
        alert('Not enough cash to pay this bill!');
        return;
    }
    if (source === 'Bank' && bill.amount > totals.bank) {
        alert('Not enough money in bank to pay this bill!');
        return;
    }

    try {
        // Mark bill as paid
        await fetch(`/api/bills/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...bill, paid: 1 })
        });

        // Add as expense under Bills category
        const billsCategory = categories.find(cat => cat.name === 'Bills');
        if (billsCategory) {
            await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: bill.amount,
                    description: `Paid: ${bill.name}`,
                    source,
                    category_id: billsCategory.id
                })
            });
        }

        await loadData();
    } catch (error) {
        console.error('Error marking bill as paid:', error);
        alert('Failed to mark bill as paid');
    }
}

async function reverseBillPayment(id) {
    const bill = bills.find(b => b.id === id);
    if (!bill || !bill.paid) return;
    
    try {
        // Set bill to unpaid
        await fetch(`/api/bills/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...bill, paid: 0 })
        });
        
        // Find and delete the corresponding expense
        const expense = expenses.find(e => e.description === `Paid: ${bill.name}`);
        if (expense) {
            await fetch(`/api/expenses/${expense.id}`, { method: 'DELETE' });
        }
        
        await loadData();
    } catch (error) {
        console.error('Error reversing bill payment:', error);
        alert('Failed to reverse bill payment');
    }
}

async function resetBudget() {
    if (!confirm('Are you sure you want to reset the budget? This will archive current expenses, adjust budgets with carryover, and reset bills to unpaid.')) {
        return;
    }
    try {
        const response = await fetch('/api/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error('Failed to reset budget');
        await loadData();
        alert('Budget reset successfully! Expenses archived, budgets adjusted, and bills reset.');
    } catch (error) {
        console.error('Error resetting budget:', error);
        alert('Failed to reset budget');
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
    if (modalId === 'expenseForm') {
        editingExpenseId = null;
        document.getElementById('expenseFormTitle').textContent = 'Add Expense';
        document.getElementById('expenseFormButton').textContent = 'Add Expense';
    } else if (modalId === 'moneyForm') {
        editingMoneyId = null;
        document.getElementById('moneyFormTitle').textContent = 'Add Money';
        document.getElementById('moneyFormButton').textContent = 'Add Money';
    } else if (modalId === 'billForm') {
        editingBillId = null;
        document.getElementById('billFormTitle').textContent = 'Add Bill';
        document.getElementById('billFormButton').textContent = 'Add Bill';
    }
}

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) hideModal(modal.id);
    });
});

// Initialize
loadData();