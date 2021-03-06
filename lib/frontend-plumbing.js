import Vue from 'vue'
import Vuex from 'vuex'
import Router from 'vue-router'
import { sync } from 'vuex-router-sync'
import Hub from 'odo-hub'
import inject from 'injectinto'

;(async () => {

Vue.config.devtools = false
Vue.config.productionTip = false

// Stores via modules
// https://vuex.vuejs.org/guide/modules.html
Vue.use(Vuex)
const modules = {}
for (let module of inject.many('store'))
  modules[module.name] = module
const store = new Vuex.Store({
  strict: process.env.NODE_ENV !== 'production',
  modules
})

// Routes
Vue.use(Router)
const router = new Router({
  mode: 'history',
  scrollBehaviour: (to, from, savedPosition) => {
    if (to.hash) return { selector: to.hash }
    if (savedPosition) return savedPosition
    return { x: 0, y: 0 }
  },
  base: process.env.BASE_URL
})

// Sync
sync(store, router)

// TODO: Support CSRF with Express
// // Setup axios with CSRF protection
// import axios from 'axios'
// axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest'
// const token = document.head.querySelector('meta[name="csrf-token"]')
// if (token) axios.defaults.headers.common['X-CSRF-TOKEN'] = token.content
// else console.error('CSRF token not found: https://laravel.com/docs/csrf#csrf-x-csrf-token')

// Setup event bus hub
const hub = Hub()
Vue.use({
  install: (Vue, options) => {
    Vue.mixin({
      beforeCreate: function () {
        const options = this.$options
        if (options.hub)
          this.$hub = options.hub
        else if (options.parent && options.parent.$hub)
          this.$hub = options.parent.$hub
      }
    })
  }
})

// launch Vue
const props = {}
const scene = new Vue({
  router, store, hub, render: h =>
    h('router-view', { props: props })
})

// Unidirectional data flow
hub.on('update', (p) => {
  Object.assign(props, p)
  return scene.$forceUpdate()
})
hub.on('reset', (p) => {
  for (let k of Object.keys(props)) delete props[k]
  return hub.emit('update')
})
// an opportunity for functional components to query
router.beforeResolve((route, from, next) => {
  const queryctx = {
    state: store.state,
    route,
    hub
  }

  Promise.all(route.matched
    .filter(m => m.components.default.options && m.components.default.options.query != null)
    .map(m => m.components.default.options.query(queryctx)))
    .then(next)
})
// clear props (transient state) after link navigation
router.afterEach((to, from) => hub.emit('reset'))

// Dispatch to many pods
const podctx = { store, router, hub, scene, props }
for (let pod of inject.many('pod')) await pod(podctx)
// unidirectional data flow - router does not pass through
// it's props so we have to inject them

inject('route', { path: '/notfound', component: () => import('../resources/notfound.vue')})
inject('route', { path: '/*', redirect: '/notfound' })
router.addRoutes(inject.many('route').map(r => {
  const p = r.props || (() => {})
  r.props = (route) => ({ ...props, ...p() })
  return r
}))

hub.emit('init').then(() => scene.$mount('#root'))

})()