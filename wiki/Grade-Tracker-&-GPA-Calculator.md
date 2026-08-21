# Grade Tracker & GPA Calculator 📊

DueVinci's **Grade Tracker & GPA Calculator** (`js/modules/grades.js`) provides real-time visibility into academic performance, course standing, and future GPA projections.

---

## 🧮 Calculation Engines

### 1. Weighted Course Average Formula
For courses with weighted grading categories:

$$\text{Course Average} = \frac{\sum_{i=1}^n \left( \frac{\text{Score}_i}{\text{MaxPoints}_i} \times \text{Weight}_i \right)}{\sum_{i=1}^n \text{Weight}_i}$$

If not all categories have graded assignments yet, the denominator automatically normalizes to the sum of active category weights.

---

### 2. Cumulative GPA Calculation
Supports both standard **4.0 Scale** (Unweighted) and **5.0 Scale** (Honors / AP Weighted):

$$\text{Cumulative GPA} = \frac{\sum (\text{Grade Points}_c \times \text{Credits}_c)}{\sum \text{Credits}_c}$$

#### Standard 4.0 Scale Mapping
| Letter Grade | Percentage Range | 4.0 Scale Grade Points |
| :--- | :--- | :--- |
| **A+ / A** | 93.0% – 100% | 4.00 |
| **A-** | 90.0% – 92.9% | 3.70 |
| **B+** | 87.0% – 89.9% | 3.30 |
| **B** | 83.0% – 86.9% | 3.00 |
| **B-** | 80.0% – 82.9% | 2.70 |
| **C+** | 77.0% – 79.9% | 2.30 |
| **C** | 73.0% – 76.9% | 2.00 |
| **C-** | 70.0% – 72.9% | 1.70 |
| **D** | 60.0% – 69.9% | 1.00 |
| **F** | Below 60.0% | 0.00 |

---

## 🔮 "What-If" Final Exam Simulator

The built-in **What-If Simulator** allows students to determine exactly what score they must achieve on remaining assignments or final exams to secure their target letter grade:

$$\text{Required Final Score} = \frac{\text{Target Average} - (\text{Current Average} \times (1 - W_{\text{final}}))}{W_{\text{final}}}$$

### Example:
- Current Average: `88%`
- Final Exam Weight: `30%` (0.30)
- Target Course Grade: `90%` (A-)
- **Required Final Exam Score**:
  $$\frac{90 - (88 \times 0.70)}{0.30} = \frac{90 - 61.6}{0.30} = \mathbf{94.67\%}$$
