// https://stackoverflow.com/questions/40564071/how-do-i-break-up-my-vuex-file
import Vue from 'vue'
import Vuex from 'vuex'
import VueResource from 'vue-resource' // https://github.com/pagekit/vue-resource
import VueStorage from 'vue-ls'
// Steem Libs
import steem from 'steem'
import sc2 from 'sc2-sdk'
// Utils
import toast from '@/utils/toast.js'

// Plugin declaration
Vue.use(Vuex)
Vue.use(VueResource)
Vue.use(VueStorage)

// Initialize SteemConnect v2
var api = sc2.Initialize({
  app: 'fast-reply.app',
  callbackURL: 'http://localhost:8080/#/steemconnect', // Dev localhost URL
  // callbackURL: 'http://fast-reply.surge.sh/steemconnect/',  // Live demo URL
  scope: ['vote', 'comment', 'custom_json']
})

let defaultConfig = {
  ignoreList: {comments: [], users: []},
  vote: 100
}

const filterIgnored = function (comments, filter, ignoreList) {
  return comments ? comments
    // Filter using selected article
    .filter(comment => (filter == null || filter.id === comment.rootId))
    // Filter comments from ignored users && Filter comments previously ignored
    .filter(comment => (!ignoreList.users.includes(comment.author) && !ignoreList.comments.includes(comment.id)))
    // Otherwise return null
    : null
}

// Create Global Store
export default new Vuex.Store({
  state: {
    steemconnect: {
      api: api,
      user: null,
      vp: null
    },
    config: Vue.ls.get('config', defaultConfig),
    timers: {},
    inbox: {
      comments: null,
      filter: null,
      selectedComment: null
    }
  },
  mutations: {
    clearIgnoreList (state) {
      state.config.ignoreList = {comments: [], users: []}
    },
    connect (state, result) {
      state.steemconnect.user = result.account
    },
    updateVP (state, vp) {
      state.steemconnect.vp = vp
    },
    logout (state) {
      // clear steemconnect state
      state.steemconnect.user = null
      state.steemconnect.vp = null
    },
    config (state, {name, value}) {
      state.config[name] = value
      Vue.ls.set('config', state.config)
    },
    timer (state, timer) {
      if (state.timers[timer]) {
        // Remove previous interval, if set
        clearInterval(state.timers[timer.name])
      }
      state.timers[timer.name] = timer.value
    },
    reload (state, result) {
      state.inbox.comments = result.data.comments
      // Count number of unique rootId among comments
      let articlesCount = state.inbox.comments.map(c => c.rootId).filter((value, index, self) => self.indexOf(value) === index).length
      console.log('Found', state.inbox.comments.length, 'new comment(s) on', articlesCount, 'articles')
      toast.createDialog('success', 'Found ' + state.inbox.comments.length + ' new comment(s) on ' + articlesCount + ' articles', 5000)
    },
    selectFilter (state, article) {
      state.inbox.filter = article
    },
    loadMessages (state, messages) {
      state.inbox.messages = messages
    },
    selectComment (state, comment) {
      state.inbox.selectedComment = comment
    },
    ignoreComment (state, commentId) {
      // Find comment based on its id and remove it from the list
      for (var i = 0; i < state.inbox.comments.length; i++) {
        if (state.inbox.comments[i].id === commentId) {
          // Find the right index and remove it
          state.inbox.comments.splice(i, 1)
        }
      }
      // Push to ignore list
      state.config.ignoreList.comments.push(commentId)
    },
    ignoreUser (state, username) {
      // Find the comments from the given user and remove them
      for (var i = 0; i < this.comments.length; i++) {
        if (state.inbox.comments[i].from === username) {
          state.inbox.comments.splice(i, 1)
        }
      }
      // Push to ignore list
      state.config.ignoreList.users.push(username)
    }
  },
  actions: {
    async connect ({ dispatch, commit, state }, token) {
      // wait for async call to resolve using await, then use result
      state.steemconnect.api.setAccessToken(token)
      commit('connect', await state.steemconnect.api.me())
      // Force reload on login
      dispatch('reload')
      // Retrieve user VP
      dispatch('updateVP')
    },
    updateVP ({ dispatch, commit, state }) {
      if (state.steemconnect.user) {
        steem.api.getAccounts([state.steemconnect.user.name], function (err, response) {
          if (!err) {
            let secondsago = (new Date() - new Date(response[0].last_vote_time + 'Z')) / 1000
            let vpow = response[0].voting_power + (10000 * secondsago / 432000)
            vpow = Math.min(vpow / 100, 100).toFixed(2)
            commit('updateVP', vpow)
          }
        })
      }
    },
    clearIgnoreList ({ dispatch, commit }) {
      commit('clearIgnoreList')
      dispatch('reload')
    },
    logout ({ commit }) {
      commit('logout')
    },
    timer ({dispatch, commit, state}, timer) {
      commit('timer', timer)
    },
    async reload ({dispatch, commit, state}) {
      let user = state.steemconnect.user
      if (user) {
        const url = 'http://api.comprendre-steem.fr/getComments?username=roxane&test=' + user.name // TODO: remove 'roxane&test=' to use logged user
        commit('reload', await Vue.http.get(url))
        dispatch('selectFirstComment')
      }
    },
    selectFirstComment ({dispatch, commit, state}) {
      // Filter to find first non ignored comment
      let filtered = filterIgnored(state.inbox.comments, state.inbox.filter, state.config.ignoreList)
      if (filtered.length > 0) {
        // Select that comment
        commit('selectComment', filtered[0])
      }
    },
    selectFilter ({dispatch, commit}, article) {
      commit('selectFilter', article)
    },
    selectComment ({dispatch, commit, state}, comment) {
      commit('selectComment', comment)
    },
    setVotePower ({dispatch, commit, state}, value) {
      commit('config', {name: 'vote', value: value})
    },
    addCommentToIgnore ({dispatch, commit, state}, commentId) {
      commit('ignoreComment', commentId)
      dispatch('selectFirstComment')
      toast.createDialog('success', 'Comments ignored', 2000)
    },
    addUserToIgnore ({dispatch, commit, state}, username) {
      commit('ignoreUser', username)
      toast.createDialog('success', 'User ignored' + username, 2000)
    }
  },
  getters: {
    user: state => {
      return state.steemconnect.user
    },
    steemconnect: state => {
      return state.steemconnect
    },
    config: state => {
      return state.config
    },
    inbox: state => {
      return {
        filter: state.inbox.filter,
        selectedComment: state.inbox.selectedComment,
        comments: filterIgnored(state.inbox.comments, state.inbox.filter, state.config.ignoreList)
      }
    }
  }
})
