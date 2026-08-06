import { useState } from 'react'
import { MenuSyncPanel } from '../components/MenuSyncPanel'
import { SyncMenuIcon } from '../components/MoreMenuIcons'
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
  onDedupeMenuDishes?: () => Promise<{
    removed: number
    groups: import('../lib/menuDishDedupe').MenuDishDupeGroup[]
  }>
  initialTab?: LibraryTab
  backLabel?: string
}

export function LibraryScreen({
  data,
  onBack,
  onSaveFood,
  onDeleteFood,
  onImportMenuRecipes,
  onDedupeMenuDishes,
  initialTab = 'products',
  backLabel = '← Назад',
}: Props) {
  const [tab, setTab] = useState<LibraryTab>(
    initialTab === 'sync' ? 'sync' : initialTab,
  )
  const [prevCatalogTab, setPrevCatalogTab] = useState<'products' | 'recipes'>(
    initialTab === 'recipes' ? 'recipes' : 'products',
  )

  const openSync = () => {
    if (tab === 'sync') {
      setTab(prevCatalogTab)
      return
    }
    if (tab === 'products' || tab === 'recipes') setPrevCatalogTab(tab)
    setTab('sync')
  }

  return (
    <section className="screen">
      <header className="screen-header library-header">
        <div className="library-header-main">
          <button type="button" className="link-btn" onClick={onBack}>
            {backLabel}
          </button>
          <h1>Справочник</h1>
        </div>
        <button
          type="button"
          className={`icon-btn sm${tab === 'sync' ? ' active' : ''}`}
          onClick={openSync}
          aria-label="Синхронизация с menu"
          title="Синхронизация с menu"
          aria-pressed={tab === 'sync'}
        >
          <SyncMenuIcon size={16} />
        </button>
      </header>

      {tab !== 'sync' && (
        <div className="mode-tabs mode-tabs-2">
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
        </div>
      )}

      {tab === 'products' && (
        <ProductsPanel data={data} onSave={onSaveFood} onDelete={onDeleteFood} />
      )}
      {tab === 'recipes' && (
        <RecipesPanel data={data} onSave={onSaveFood} onDelete={onDeleteFood} />
      )}
      {tab === 'sync' && (
        <MenuSyncPanel
          data={data}
          onImportRecipes={onImportMenuRecipes}
          onDedupeDishes={onDedupeMenuDishes}
          onDeleteFood={onDeleteFood}
        />
      )}
    </section>
  )
}
