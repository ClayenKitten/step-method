<script lang="ts">
	import { asset, resolve } from '$app/paths';
</script>

<h1>Метод STEM — многокритериальное линейное программирование</h1>

<section class="description">
	<p>
		<strong>Метод STEM</strong> (Step Method — «метод последовательных шагов») предложен в 1971 году Р.
		Бенаюном, Ж. де Монгольфье, Ж. Терни и О. Ларичевым для решения задач линейного программирования с
		несколькими целевыми функциями. Критерии в таких задачах обычно противоречат друг другу: улучшить
		один можно лишь за счёт ухудшения остальных, поэтому решения, лучшего сразу по всем критериям, как
		правило, не существует. Метод чередует расчёты на компьютере с решениями лица, принимающего решения
		(ЛПР), и за несколько шагов приводит к компромиссному плану, который ЛПР признаёт приемлемым.
	</p>

	<h2>Как работает алгоритм</h2>

	<ol>
		<li>
			<strong>Таблица значений критериев.</strong> Каждый критерий z<sub>i</sub>
			оптимизируется по отдельности на допустимом множестве задачи. Получается k планов — по одному на
			каждый критерий; значения всех критериев в этих планах образуют таблицу. Из неё берутся:
			<ul>
				<li>
					<strong>идеальные значения</strong> z<sub>i</sub>* — лучшие значения каждого критерия (на
					диагонали таблицы);
				</li>
				<li><strong>худшие значения</strong> — худшее значение каждого критерия по таблице;</li>
				<li>
					<strong>веса</strong> w<sub>i</sub> по относительному разбросу критерия: α<sub>i</sub> =
					|z<sub>i</sub>* − z<sub>i</sub><sup>худш</sup>| / |z<sub>i</sub>*| с нормировкой Σ w<sub
						>i</sub
					> = 1 — чем сильнее значения критерия разбросаны по таблице, тем больший вес он получает.
				</li>
			</ul>
		</li>
		<li>
			<strong>Минимаксная задача.</strong> Решается задача линейного программирования:
			<div class="equations">
				<div>min λ</div>
				<div>
					λ ≥ w<sub>i</sub>·(z<sub>i</sub>* − z<sub>i</sub>(x)) — для каждого активного критерия i
				</div>
				<div>x ∈ X — исходные ограничения задачи</div>
				<div>z<sub>r</sub>(x) ≥ bound<sub>r</sub> — уступки, сделанные на предыдущих шагах</div>
			</div>
			Компьютер ищет план, при котором все ещё активные критерии одновременно находятся как можно ближе
			к своим идеальным значениям: минимизируется наибольшее взвешенное отклонение λ (взвешенная чебышёвская
			метрика).
		</li>
		<li>
			<strong>Шаг ЛПР: принять или уступить.</strong> Компьютер предъявляет найденный план и значения
			всех критериев. Если план устраивает — компромисс найден, процесс завершён. Иначе ЛПР выбирает критерий,
			который сейчас ближе всего к своему идеалу (его «жалко меньше всего»), и назначает уступку Δ — на
			сколько этот критерий разрешается ухудшить.
		</li>
		<li>
			<strong>Сужение задачи.</strong> Выбранный критерий исключается из активных и превращается в ограничение:
			ему разрешается быть не хуже, чем его текущее значение минус уступка. Минимаксная задача решается
			заново уже без этого критерия — освободившаяся свобода направляется на улучшение остальных.
		</li>
		<li>
			<strong>Останов.</strong> Шаги 2–4 повторяются, пока ЛПР не примет предложенный план либо пока не
			останется один активный критерий — тогда текущее решение окончательное. Уступок не больше k − 1,
			поэтому процесс гарантированно завершается.
		</li>
	</ol>

	<div class="paper-link">
		📄 Оригинальная статья: R. Benayoun, J. de Montgolfier, J. Tergny, O. Laritchev. «Linear
		programming with multiple objective functions: Step Method (STEM)». Operations Research, 1971 — <a
			href={asset('benayoun1971.pdf')}
			target="_blank"
			rel="noopener">открыть PDF</a
		>
	</div>
</section>

<div class="cta">
	<a class="cta-button" href={resolve('/try')}>Попробовать</a>
	<p class="hint">
		Задайте свою задачу и пройдите все шаги метода: от таблицы значений критериев до компромиссного
		решения.
	</p>
</div>

<style>
	.description {
		background: #fff;
		border: 1px solid #e2e4e8;
		border-radius: 4px;
		padding: 0.5rem 1.25rem 1rem;
		margin: 0.75rem 0 1.5rem;
	}

	.description h2 {
		margin-top: 1.25rem;
	}

	.description ol {
		margin: 0.5rem 0;
		padding-left: 1.4rem;
	}

	.description > ol > li {
		margin: 0.6rem 0;
	}

	.description ul {
		margin: 0.35rem 0;
		padding-left: 1.3rem;
		list-style: disc;
	}

	.description li li {
		margin: 0.25rem 0;
	}

	.paper-link {
		margin-top: 1rem;
		padding: 0.6rem 0.9rem;
		background: #f0f7ff;
		border: 1px solid #cfe3ff;
		border-left: 3px solid #7aa7ff;
		border-radius: 4px;
		font-size: 0.92rem;
	}

	.paper-link a {
		color: #1d5fbf;
		font-weight: 600;
	}

	.cta {
		text-align: center;
		margin: 2rem 0 1rem;
	}

	.cta-button {
		display: inline-block;
		font-size: 1.15rem;
		font-weight: 600;
		padding: 0.7rem 2.2rem;
		background: #2f6fed;
		color: #fff;
		border-radius: 6px;
		text-decoration: none;
	}

	.cta-button:hover {
		background: #245cc9;
	}
</style>
