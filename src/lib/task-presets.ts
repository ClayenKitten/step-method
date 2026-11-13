import type { TaskForm } from './task-url';

/** A ready-made example that can be loaded into the form with one click. */
export interface TaskPreset {
	/** Short button label. */
	title: string;
	/** Small text describing the task, shown when the preset is chosen. */
	description: string[];
	/** The task definition applied to the form. */
	task: TaskForm;
}

export const taskPresets: TaskPreset[] = [
	{
		title: 'Производство',
		description: [
			'Постановка: цех выпускает два вида продукции — x1 и x2 (в сотнях единиц за смену). Станок А требует x1 + 2·x2 станко-часов (лимит 8), станок Б — 3·x1 + x2 (лимит 9).',
			'Цели: z1 — прибыль, max z1 = 2·x1 + 3·x2; z2 — общий выпуск, max z2 = 4·x1 + x2.',
			'Конфликт: изделие x2 выгоднее по прибыли, но сильнее грузит станок А; изделие x1 даёт больший вклад в выпуск. Максимумы обеих целей достигаются в разных точках, поэтому чистого оптимума нет — нужен компромисс.'
		],
		task: {
			varNames: ['x1', 'x2'],
			objectives: [
				{ name: 'z1', sense: 'max', coeffs: [2, 3] },
				{ name: 'z2', sense: 'max', coeffs: [4, 1] }
			],
			constraints: [
				{ coeffs: [1, 2], sense: '<=', rhs: 8 },
				{ coeffs: [3, 1], sense: '<=', rhs: 9 }
			]
		}
	},
	{
		title: 'Диета',
		description: [
			'Постановка: рацион из двух продуктов — x1 (кг крупы) и x2 (кг овощей). Нормы: общий объём не меньше 3 кг (x1 + x2 ≥ 3), белок — не меньше 4 условных единиц (2·x1 + x2 ≥ 4).',
			'Цели: z1 — стоимость, min z1 = 2·x1 + x2; z2 — калорийность, min z2 = x1 + 3·x2.',
			'Конфликт: овощи дешевле (1 против 2 за кг), но калорийнее (3 против 1); крупа снижает калорийность, но дорожает рацион. Минимумы стоимости и калорийности лежат в разных углах допустимой области.'
		],
		task: {
			varNames: ['x1', 'x2'],
			objectives: [
				{ name: 'z1', sense: 'min', coeffs: [2, 1] },
				{ name: 'z2', sense: 'min', coeffs: [1, 3] }
			],
			constraints: [
				{ coeffs: [1, 1], sense: '>=', rhs: 3 },
				{ coeffs: [2, 1], sense: '>=', rhs: 4 }
			]
		}
	},
	{
		title: 'Проект',
		description: [
			'Постановка: фирма распределяет объёмы двух работ — x1 и x2 (в тысячах единиц). Лимиты: рабочие часы x1 + x2 ≤ 5, материалы 2·x1 + x2 ≤ 8.',
			'Цели: z1 — доход, max z1 = 5·x1 + 4·x2; z2 — трудозатраты, min z2 = 3·x1 + 2·x2.',
			'Конфликт: доход растёт вместе с объёмами, и вместе с ними растут трудозатраты; максимум дохода и минимум трудозатрат — противоположные полюса, между ними и выбирается компромисс.'
		],
		task: {
			varNames: ['x1', 'x2'],
			objectives: [
				{ name: 'z1', sense: 'max', coeffs: [5, 4] },
				{ name: 'z2', sense: 'min', coeffs: [3, 2] }
			],
			constraints: [
				{ coeffs: [1, 1], sense: '<=', rhs: 5 },
				{ coeffs: [2, 1], sense: '<=', rhs: 8 }
			]
		}
	}
];
