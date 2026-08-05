import { useState } from 'react'
import { MenuSyncPanel } from '../components/MenuSyncPanel'
import type { AppData, FoodItem } from '../types'
import type { MenuImportResult } from '../lib/menuSync'
import { ProductsPanel } from './ProductsPanel'
import { RecipesPanel } from './RecipesPanel'

type LibraryTab = 'products' | 'recipes' | 'sync'

type Props = {
  data: AppData
  onBack: () => void
  onSaveFood: (input: Omit<FoodItem, 'id' | 'updatedAt'> & { id?: string }) => Promise<FoodItem>
  onDeleteFood: (id: string) => Promise<void>
  onImportMenuRecipes: (
    raw: unknown,
    onProgress?: (msg: string) => void,
  ) => Promise<MenuImportResult>
  initialTab?: LibraryTab
  backLabel?: string
}

export function LibraryScreen({
  data,
  onBack,
  onSaveFood,
  onDeleteFood,
  onImportMenuRecipes,
  initialTab = 'products',
  backLabel = '← Назад',
}: Props) {
  const [tab, setTab] = useState<LibraryTab>(initialTab)

  return (
    <section className="screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          {backLabel}
        </button>
        <h1>Справочник</h1>
      </header>

      <div className="mode-tabs mode-tabs-3">
        <button
          type="button"
          className={`mode-tab${tab === 'products' ? ' active' : ''}`}
          onClick={() => setTab('products')}
        >
          Продукты
        </button>
        <button
          type="button"
          className={`mode-tab${tab === 'recipes' ? ' active' : ''}`}
          onClick={() => setTab('recipes')}
        >
          Рецепты
        </button>
        <button
          type="button"
          className={`mode-tab${tab === 'sync' ? ' active' : ''}`}
          onClick={() => setTab('sync')}
        >
          Menu
        </button>
      </div>

      {tab === 'products' && (
        <ProductsPanel data={data} onSave={onSaveFood} onDelete={onDeleteFood} />
      )}
      {tab === 'recipes' && (
        <RecipesPanel data={data} onSave={onSaveFood} onDelete={onDeleteFood} />
      )}
      {tab === 'sync' && <MenuSyncPanel data={data} onImportRecipes={onImportMenuRecipes} />}
    </section>
  )
}
