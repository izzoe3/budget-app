let money = [];
let categories = [];
let expenses = [];
let bills = [];
let currentHistoryTab = 'expenses';

async function loadData() {
  try {
    const [moneyRes, catRes, expRes, billRes] = await Promise.all([
      fetch('/api/money'),
      fetch('/api/categories'),
      fetch('/api/expenses'),
      fetch('/api/bills')
    ]);
    if (!moneyRes.ok || !catRes.ok || !expRes.ok || !billRes.ok) throw new Error('Failed to fetch data');
    money = await moneyRes.json();
    categories = await catRes.json();
    expenses = await expRes.json();
    bills = await billRes.json();
    updateDisplay();
  } catch (error) {
    showError('Failed to load data');
  }
}

function calculateTotals() {
  const cashIncome = money.filter(m => m.location === 'Cash').reduce((sum, m) => sum + m.amount, 0);
  const bankIncome = money.filter(m => m.location === 'Bank').reduce((sum, m) => sum + m.amount, 0);
  const mytabung = money.filter(m => m.location === 'MyTabung').reduce((sum, m) => sum + m.amount, 0);
  const cashExpenses = expenses.filter(e => e.source === 'Cash').reduce((sum, e) => sum + e.amount, 0);
  const bankExpenses = expenses.filter(e => e.source === 'Bank').reduce((sum, e) => sum + e.amount, 0);
  const cash = cashIncome - cashExpenses;
  const bank = bankIncome - bankExpenses;
  return {
    spendable: cash + bank,
    cash: cash,
    bank: bank,
    mytabung: mytabung
  };
}

function isToday(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  return dateStr.split('T')[0] === today;
}

function updateDisplay() {
  const totals = calculateTotals();
  document.getElementById('totalAmount').textContent = `RM ${totals.spendable.toFixed(2)}`;
  document.getElementById('cashBalance').textContent = totals.cash.toFixed(2);
  document.getElementById('bankBalance').textContent = totals.bank.toFixed(2);
  document.getElementById('mytabungBalance').textContent = totals.mytabung.toFixed(2);

  const todaySpent = expenses.filter(e => isToday(e.date)).reduce((sum, e) => sum + e.amount, 0);
  const todayAdded = money.filter(m => isToday(m.date)).reduce((sum, m) => sum + m.amount, 0);
  document.getElementById('todaySummary').textContent = `Spent: RM ${todaySpent.toFixed(2)} | Added: RM ${todayAdded.toFixed(2)}`;

  const todayExpenses = document.getElementById('todayExpenses');
  todayExpenses.innerHTML = expenses.filter(e => isToday(e.date)).map(e => `
    <div class="list-item">${e.description}: RM ${e.amount.toFixed(2)} (${e.source}, ${e.category_name})</div>
  `).join('') || '<div class="list-item">No expenses today</div>';

  const todayMoney = document.getElementById('todayMoney');
  todayMoney.innerHTML = money.filter(m => isToday(m.date)).map(m => `
    <div class="list-item">${m.description}: RM ${m.amount.toFixed(2)} (${m.location}, ${m.source})</div>
  `).join('') || '<div class="list-item">No income today</div>';

  const categoryList = document.getElementById('categoryList');
  categoryList.innerHTML = categories.map(cat => {
    const spent = expenses.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + e.amount, 0);
    if (cat.name === 'Others') {
      return `
        <div class="list-item category-item" onclick="showCategoryExpenses(${cat.id}, '${cat.name}')">
          <div>${cat.name}: RM ${spent.toFixed(2)}</div>
        </div>
      `;
    }
    const percent = cat.budget ? (spent / cat.budget) * 100 : 0;
    return `
      <div class="list-item category-item" onclick="showCategoryExpenses(${cat.id}, '${cat.name}')">
        <div>${cat.name}: RM ${spent.toFixed(2)} / ${cat.budget.toFixed(2)}</div>
        <div class="progress-bar"><div style="width: ${Math.min(percent, 100)}%; ${percent >= 100 ? 'background: var(--danger)' : percent >= 80 ? 'background: var(--warning)' : ''}"></div></div>
      </div>
    `;
  }).join('') || '<div class="list-item">No categories</div>';

  const expenseCategorySelect = document.getElementById('expenseCategorySelect');
  expenseCategorySelect.innerHTML = '<option value="">Select Category</option>' + 
    categories.filter(cat => cat.name !== 'Bills' && cat.name !== 'Others').map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');

  const upcomingBills = document.getElementById('upcomingBills');
  upcomingBills.innerHTML = bills.filter(b => !b.paid).map(b => `
    <div class="list-item">
      <span>${b.name}: RM ${b.amount.toFixed(2)} (Due: ${b.due_date})</span>
      <div>
        <button class="pay" onclick="markBillPaid(${b.id}, this)">Pay</button>
        <button onclick="deleteBill(${b.id}, this)">Delete</button>
      </div>
    </div>
  `).join('') || '<div class="list-item">No upcoming bills</div>';

  const paidBills = document.getElementById('paidBills');
  paidBills.innerHTML = bills.filter(b => b.paid).map(b => `
    <div class="list-item">
      <span>${b.name}: RM ${b.amount.toFixed(2)} (Paid: ${new Date(b.paid_date).toLocaleDateString()})</span>
      <button onclick="reverseBillPayment(${b.id})">Reverse</button>
    </div>
  `).join('') || '<div class="list-item">No paid bills</div>';

  const historyContent = document.getElementById('historyContent');
  if (currentHistoryTab === 'expenses') {
    historyContent.innerHTML = expenses.map(e => `
      <div class="list-item">
        <span>${e.description}: RM ${e.amount.toFixed(2)} (${e.source}, ${e.category_name}) - ${new Date(e.date).toLocaleString()}</span>
        <div>
          <button class="edit" onclick="editExpense(${e.id})">Edit</button>
          <button onclick="deleteExpense(${e.id})">Delete</button>
        </div>
      </div>
    `).join('') || '<div class="list-item">No expenses</div>';
  } else if (currentHistoryTab === 'money') {
    historyContent.innerHTML = money.map(m => `
      <div class="list-item">
        <span>${m.description}: RM ${m.amount.toFixed(2)} (${m.location}, ${m.source}) - ${new Date(m.date).toLocaleString()}</span>
        <button class="edit" onclick="editMoney(${m.id})">Edit</button>
      </div>
    `).join('') || '<div class="list-item">No income</div>';
  } else if (currentHistoryTab === 'bills') {
    historyContent.innerHTML = bills.map(b => `
      <div class="list-item">
        <span>${b.name}: RM ${b.amount.toFixed(2)} (Due: ${b.due_date}, ${b.paid ? `Paid: ${new Date(b.paid_date).toLocaleString()}` : 'Unpaid'})</span>
        ${b.paid ? `<button onclick="reverseBillPayment(${b.id})">Reverse</button>` : ''}
      </div>
    `).join('') || '<div class="list-item">No bills</div>';
  }
}

function showCategoryExpenses(categoryId, categoryName) {
  const modal = document.getElementById('categoryModal');
  const modalHeader = document.getElementById('modalHeader');
  const categoryExpenses = document.getElementById('categoryExpenses');

  modalHeader.textContent = `${categoryName} Expenses`;
  const filteredExpenses = expenses.filter(e => e.category_id === categoryId);
  categoryExpenses.innerHTML = filteredExpenses.map(e => `
    <div class="list-item">
      <span>${e.description}: RM ${e.amount.toFixed(2)} (${e.source}) - ${new Date(e.date).toLocaleString()}</span>
      <div>
        <button class="edit" onclick="editExpense(${e.id})">Edit</button>
        <button onclick="deleteExpense(${e.id})">Delete</button>
      </div>
    </div>
  `).join('') || '<div class="list-item">No expenses in this category</div>';

  modal.style.display = 'flex';
}

function closeModal() {
  const modal = document.getElementById('categoryModal');
  modal.style.display = 'none';
}

async function addMoney() {
  const amount = parseFloat(document.getElementById('moneyAmount').value);
  const description = document.getElementById('moneyDescription').value;
  const location = document.getElementById('moneyLocation').value;
  const source = document.getElementById('moneyIncomeSource').value;
  if (!amount || isNaN(amount) || amount <= 0 || !description || !['Cash', 'Bank', 'MyTabung'].includes(location) || !['Salary', 'Freelance', 'Donation', 'Others'].includes(source)) {
    return showError('Invalid money input');
  }
  try {
    const response = await fetch('/api/money', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, location, source, description })
    });
    if (!response.ok) throw new Error((await response.json()).error || 'Failed to add money');
    document.getElementById('moneyAmount').value = '';
    document.getElementById('moneyDescription').value = '';
    document.getElementById('moneyLocation').value = 'Cash';
    document.getElementById('moneyIncomeSource').value = 'Salary';
    await loadData();
  } catch (error) {
    showError(error.message);
  }
}

async function editMoney(id) {
  const entry = money.find(m => m.id === id);
  if (!entry) return;
  const amount = parseFloat(prompt('New amount:', entry.amount));
  const description = prompt('New description:', entry.description);
  const location = prompt('New location (Cash, Bank, MyTabung):', entry.location);
  const source = prompt('New source (Salary, Freelance, Donation, Others):', entry.source);
  if (!amount || !description || !['Cash', 'Bank', 'MyTabung'].includes(location) || !['Salary', 'Freelance', 'Donation', 'Others'].includes(source)) {
    return showError('Invalid input');
  }
  try {
    await fetch(`/api/money/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, location, source, description })
    });
    await loadData();
  } catch (error) {
    showError(error.message);
  }
}

async function addExpense() {
  const amount = parseFloat(document.getElementById('expAmount').value);
  const description = document.getElementById('description').value;
  const source = document.getElementById('moneySource').value;
  const category_id = document.getElementById('expenseCategorySelect').value || null;
  const totals = calculateTotals();

  if (!amount || !description || !['Cash', 'Bank'].includes(source)) return showError('Invalid expense input');
  if (source === 'Cash' && amount > totals.cash) return showError('Not enough cash');
  if (source === 'Bank' && amount > totals.bank) return showError('Not enough in bank');

  if (category_id) {
    const cat = categories.find(c => c.id === parseInt(category_id));
    const spent = expenses.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + e.amount, 0);
    const percent = ((spent + amount) / cat.budget) * 100;
    if (percent >= 100 && !confirm(`Exceeds ${cat.name} budget (RM ${(spent + amount).toFixed(2)} / ${cat.budget.toFixed(2)}). Proceed?`)) return;
  }

  try {
    const response = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, description, source, category_id })
    });
    if (!response.ok) throw new Error((await response.json()).error || 'Failed to add expense');
    document.getElementById('expAmount').value = '';
    document.getElementById('description').value = '';
    document.getElementById('moneySource').value = 'Cash';
    document.getElementById('expenseCategorySelect').value = '';
    await loadData();
  } catch (error) {
    showError(error.message);
  }
}

async function editExpense(id) {
  const exp = expenses.find(e => e.id === id);
  if (!exp) return;
  const amount = parseFloat(prompt('New amount:', exp.amount));
  const description = prompt('New description:', exp.description);
  const source = prompt('New source (Cash, Bank):', exp.source);
  const category_id = prompt('New category ID (blank for none):', exp.category_id || '');
  if (!amount || !description || !['Cash', 'Bank'].includes(source)) return showError('Invalid input');
  try {
    await fetch(`/api/expenses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, description, source, category_id: category_id || null })
    });
    await loadData();
    closeModal(); // Close the modal after editing
  } catch (error) {
    showError(error.message);
  }
}

async function deleteExpense(id) {
  if (!confirm('Delete expense?')) return;
  try {
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    await loadData();
    closeModal(); // Close the modal after deleting
  } catch (error) {
    showError('Failed to delete');
  }
}

async function addCategory() {
  const name = document.getElementById('categoryName').value;
  const budget = parseFloat(document.getElementById('categoryAmount').value);
  if (!name || !budget || name === 'Bills' || name === 'Others') return showError('Invalid category input');
  try {
    await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, budget })
    });
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryAmount').value = '';
    await loadData();
  } catch (error) {
    showError(error.message);
  }
}

async function saveBill() {
  const name = document.getElementById('billName').value;
  const amount = parseFloat(document.getElementById('billAmount').value);
  const due_date = document.getElementById('billDueDate').value;
  const is_fixed = parseInt(document.getElementById('billType').value);
  if (!name || (is_fixed && !amount) || !due_date) return showError('Invalid bill input');
  try {
    await fetch('/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, amount: amount || 0, is_fixed, due_date })
    });
    document.getElementById('billName').value = '';
    document.getElementById('billAmount').value = '';
    document.getElementById('billDueDate').value = '';
    await loadData();
  } catch (error) {
    showError(error.message);
  }
}

async function markBillPaid(id, button) {
  const bill = bills.find(b => b.id === id);
  if (!bill || bill.paid) return;
  button.disabled = true;
  const totals = calculateTotals();
  const source = totals.cash >= bill.amount ? 'Cash' : 'Bank';
  if (source === 'Cash' && bill.amount > totals.cash || source === 'Bank' && bill.amount > totals.bank) {
    button.disabled = false;
    return showError(`Not enough in ${source.toLowerCase()}`);
  }
  try {
    await fetch(`/api/bills/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...bill, paid: 1 })
    });
    const billsCat = categories.find(c => c.name === 'Bills');
    if (billsCat) {
      await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: bill.amount, description: `Paid: ${bill.name}`, source, category_id: billsCat.id })
      });
    }
    await loadData();
  } catch (error) {
    button.disabled = false;
    showError(error.message);
  }
}

async function deleteBill(id, button) {
  if (!confirm('Delete bill?')) return;
  button.disabled = true;
  try {
    await fetch(`/api/bills/${id}`, { method: 'DELETE' });
    await loadData();
  } catch (error) {
    button.disabled = false;
    showError('Failed to delete');
  }
}

async function reverseBillPayment(id) {
  const bill = bills.find(b => b.id === id);
  if (!bill || !bill.paid) return;
  try {
    await fetch(`/api/bills/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...bill, paid: 0, paid_date: null })
    });
    const exp = expenses.find(e => e.description === `Paid: ${bill.name}`);
    if (exp) await fetch(`/api/expenses/${exp.id}`, { method: 'DELETE' });
    await loadData();
  } catch (error) {
    showError('Failed to reverse');
  }
}

async function resetBudget() {
  if (!confirm('Reset budget?')) return;
  try {
    await fetch('/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    await loadData();
    alert('Budget reset');
  } catch (error) {
    showError('Failed to reset');
  }
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  document.querySelector(`button[onclick="showScreen('${screenId}')"]`).classList.add('active');
  updateDisplay();
}

function switchHistoryTab(tab) {
  currentHistoryTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`button[onclick="switchHistoryTab('${tab}')"]`).classList.add('active');
  updateDisplay();
}

function toggleSection(header) {
  header.parentElement.classList.toggle('active');
}

function showError(message) {
  const div = document.createElement('div');
  div.style.cssText = 'position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: var(--danger); color: white; padding: 8px 16px; border-radius: 4px; z-index: 1000; font-size: 14px;';
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

loadData();