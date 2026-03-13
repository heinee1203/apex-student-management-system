function generateTuitionObligations(studentId, paymentTerm, totalTuition, schoolYear) {
  const startYear = parseInt(schoolYear.split('-')[0]);
  const installments = [];

  if (paymentTerm === 'Monthly') {
    const months = [
      { month: 5, label: 'June' },
      { month: 6, label: 'July' },
      { month: 7, label: 'August' },
      { month: 8, label: 'September' },
      { month: 9, label: 'October' },
      { month: 10, label: 'November' },
      { month: 11, label: 'December' },
      { month: 0, label: 'January' },
      { month: 1, label: 'February' },
      { month: 2, label: 'March' },
    ];
    const perInstallment = Math.round((totalTuition / 10) * 100) / 100;
    months.forEach((m, i) => {
      const year = m.month >= 5 ? startYear : startYear + 1;
      const dueDate = `${year}-${String(m.month + 1).padStart(2, '0')}-15`;
      const amount = i === 9 ? Math.round((totalTuition - perInstallment * 9) * 100) / 100 : perInstallment;
      installments.push({
        student_id: studentId,
        fee_type: 'Tuition Fee',
        payment_term: paymentTerm,
        installment_number: `${i + 1} of 10`,
        school_year: schoolYear,
        amount,
        due_date: dueDate,
        description: `Tuition - Installment ${i + 1} of 10 (${m.label} ${year})`,
      });
    });
  } else if (paymentTerm === 'Quarterly') {
    const quarters = [
      { month: 5, label: 'June' },
      { month: 8, label: 'September' },
      { month: 10, label: 'November' },
      { month: 0, label: 'January' },
    ];
    const perQuarter = Math.round((totalTuition / 4) * 100) / 100;
    quarters.forEach((q, i) => {
      const year = q.month >= 5 ? startYear : startYear + 1;
      const dueDate = `${year}-${String(q.month + 1).padStart(2, '0')}-15`;
      const amount = i === 3 ? Math.round((totalTuition - perQuarter * 3) * 100) / 100 : perQuarter;
      installments.push({
        student_id: studentId,
        fee_type: 'Tuition Fee',
        payment_term: paymentTerm,
        installment_number: `${i + 1} of 4`,
        school_year: schoolYear,
        amount,
        due_date: dueDate,
        description: `Tuition - Installment ${i + 1} of 4 (${q.label} ${year})`,
      });
    });
  } else if (paymentTerm === 'Annually') {
    installments.push({
      student_id: studentId,
      fee_type: 'Tuition Fee',
      payment_term: paymentTerm,
      installment_number: '1 of 1',
      school_year: schoolYear,
      amount: totalTuition,
      due_date: `${startYear}-06-15`,
      description: `Tuition - Full Payment (June ${startYear})`,
    });
  }

  return installments;
}

module.exports = { generateTuitionObligations };
